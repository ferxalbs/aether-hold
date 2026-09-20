import { EvaluationTimeoutError, evaluateHold, MAX_REQUEST_BYTES } from "@/lib/evaluation";
import { ProviderConfigurationError, ProviderNotConfiguredError, resolveProviderConfig } from "@/lib/provider-config";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordProviderSpend, reserveProviderBudget, SpendingGuardOpenError } from "@/lib/spending";
import { type EvaluationErrorResponse, holdInputSchema } from "@/packages/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json<T>(payload: T, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...baseHeaders, ...extraHeaders },
  });
}

function errorResponse(
  error: EvaluationErrorResponse,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return json(error, status, extraHeaders);
}

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return errorResponse(
      {
        error: "INVALID_INPUT",
        message: "That request is too large. Keep the draft and optional context within the stated limits.",
        retryable: false,
      },
      413,
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse({ error: "INVALID_INPUT", message: "The request could not be read.", retryable: false }, 400);
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return errorResponse(
      {
        error: "INVALID_INPUT",
        message: "That request is too large. Keep the draft and optional context within the stated limits.",
        retryable: false,
      },
      413,
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse({ error: "INVALID_INPUT", message: "Send a valid JSON request.", retryable: false }, 400);
  }

  const parsed = holdInputSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return errorResponse(
      {
        error: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message || "Check the draft and context fields.",
        retryable: false,
      },
      400,
    );
  }

  try {
    const providerConfig = resolveProviderConfig();
    if (providerConfig.mode === "typesafe" && !providerConfig.hasApiKey) {
      throw new ProviderNotConfiguredError();
    }

    const rateLimit = await checkRateLimit(request, "communication", request.signal);
    if (!rateLimit.allowed) {
      return errorResponse(
        {
          error: "RATE_LIMITED",
          message: "Too many evaluations. Please wait a moment and try again.",
          retryable: true,
        },
        429,
        {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      );
    }

    reserveProviderBudget("communication");
    const response = await evaluateHold(parsed.data, { signal: request.signal });
    if (response.estimatedCostUsd !== null) recordProviderSpend("communication", response.estimatedCostUsd);
    return json(response, 200, rateLimit.enabled ? { "X-RateLimit-Remaining": String(rateLimit.remaining) } : {});
  } catch (error) {
    if (error instanceof SpendingGuardOpenError) {
      return errorResponse(
        {
          error: "RATE_LIMITED",
          message: "The provider spending guard is open. Please try again later.",
          retryable: true,
        },
        429,
        { "Retry-After": String(error.retryAfterSeconds) },
      );
    }
    if (error instanceof ProviderNotConfiguredError) {
      return errorResponse(
        {
          error: "provider_not_configured",
          message: "HOLD is not configured for a real Jev provider. Please add TYPESAFE_API_KEY and try again.",
          retryable: false,
        },
        503,
      );
    }
    if (error instanceof ProviderConfigurationError) {
      return errorResponse(
        {
          error: "provider_not_configured",
          message: "HOLD provider configuration is invalid for this environment.",
          retryable: false,
        },
        503,
      );
    }

    if (error instanceof EvaluationTimeoutError) {
      return errorResponse(
        { error: "TIMEOUT", message: "The judgment took too long. Please try again.", retryable: true },
        504,
      );
    }

    return errorResponse(
      {
        error: "EVALUATION_FAILED",
        message: "HOLD could not complete this judgment. Please try again.",
        retryable: true,
      },
      502,
    );
  }
}
