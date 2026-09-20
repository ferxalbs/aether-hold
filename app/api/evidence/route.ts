import { z } from "zod";
import {
  isEvidenceEnabled,
  ProviderConfigurationError,
  ProviderNotConfiguredError,
  resolveProviderConfig,
} from "@/lib/provider-config";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordProviderSpend, reserveProviderBudget, SpendingGuardOpenError } from "@/lib/spending";
import { type HoldInput, holdContextSchema } from "@/packages/core";
import {
  ConfiguredEvidenceSearchProvider,
  createNotNeededEvidenceResponse,
  EvidenceProviderNotConfiguredError,
  EvidenceTimeoutError,
  evaluateEvidence,
  FakeClaimSelectionProvider,
  FakeEvidenceRerankProvider,
  FakeEvidenceSearchProvider,
  FakeQuerySelectionProvider,
  TypeSafeClaimSelectionProvider,
  TypeSafeEvidenceRerankProvider,
  TypeSafeQuerySelectionProvider,
} from "@/packages/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EVIDENCE_REQUEST_BYTES = 20_000;
const evidenceInputSchema = z
  .object({
    draft: z
      .string()
      .min(1)
      .max(8_000)
      .refine((value) => value.trim().length > 0, "Draft is required"),
    context: holdContextSchema,
    audience: z.string().max(2_000).optional(),
    intent: z.string().max(2_000).optional(),
    conversationContext: z.string().max(2_000).optional(),
    verify: z.boolean().default(false),
  })
  .strict();

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(payload: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, ...extra } });
}

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_EVIDENCE_REQUEST_BYTES) {
    return json({ error: "INVALID_INPUT", message: "That request is too large.", retryable: false }, 413);
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return json({ error: "INVALID_INPUT", message: "The request could not be read.", retryable: false }, 400);
  }
  if (new TextEncoder().encode(body).byteLength > MAX_EVIDENCE_REQUEST_BYTES) {
    return json({ error: "INVALID_INPUT", message: "That request is too large.", retryable: false }, 413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return json({ error: "INVALID_INPUT", message: "Send a valid JSON request.", retryable: false }, 400);
  }
  const parsed = evidenceInputSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return json(
      {
        error: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message || "Check the Evidence fields.",
        retryable: false,
      },
      400,
    );
  }

  // A non-verification request is a deliberate no-op. Do not require a
  // search provider, consume a rate-limit token, or reserve provider budget.
  if (!parsed.data.verify) return json(createNotNeededEvidenceResponse());

  try {
    const config = resolveProviderConfig();
    if (config.mode === "typesafe" && !config.hasApiKey) throw new ProviderNotConfiguredError();
    if (config.mode === "typesafe" && !isEvidenceEnabled()) {
      throw new EvidenceProviderNotConfiguredError("Evidence is disabled for this environment.");
    }
    const rate = await checkRateLimit(request, "evidence", request.signal);
    if (!rate.allowed) {
      return json(
        { error: "RATE_LIMITED", message: "Too many evidence searches. Please wait and try again.", retryable: true },
        429,
        { "Retry-After": String(rate.retryAfterSeconds), "X-RateLimit-Remaining": String(rate.remaining) },
      );
    }
    const rerankRate = await checkRateLimit(request, "rerank", request.signal);
    if (!rerankRate.allowed) {
      return json(
        { error: "RATE_LIMITED", message: "Evidence reranking is temporarily rate limited.", retryable: true },
        429,
        { "Retry-After": String(rerankRate.retryAfterSeconds), "X-RateLimit-Remaining": String(rerankRate.remaining) },
      );
    }
    reserveProviderBudget("evidence");

    const input: HoldInput = {
      draft: parsed.data.draft,
      context: parsed.data.context,
      ...(parsed.data.audience ? { audience: parsed.data.audience } : {}),
      ...(parsed.data.intent ? { intent: parsed.data.intent } : {}),
      ...(parsed.data.conversationContext ? { conversationContext: parsed.data.conversationContext } : {}),
    };
    const dependencies =
      config.mode === "fake"
        ? {
            searchProvider: new FakeEvidenceSearchProvider(),
            claimProvider: new FakeClaimSelectionProvider(),
            queryProvider: new FakeQuerySelectionProvider(),
            rerankProvider: new FakeEvidenceRerankProvider(),
          }
        : {
            searchProvider: new ConfiguredEvidenceSearchProvider(),
            claimProvider: new TypeSafeClaimSelectionProvider(),
            queryProvider: new TypeSafeQuerySelectionProvider(),
            rerankProvider: new TypeSafeEvidenceRerankProvider(),
          };
    const result = await evaluateEvidence(input, dependencies, {
      verifyRequested: parsed.data.verify,
      signal: request.signal,
    });
    if (result.receipt.estimatedCostUsd !== null) recordProviderSpend("evidence", result.receipt.estimatedCostUsd);
    return json(result, 200, rate.enabled ? { "X-RateLimit-Remaining": String(rate.remaining) } : {});
  } catch (error) {
    if (error instanceof SpendingGuardOpenError) {
      return json(
        {
          error: "RATE_LIMITED",
          message: "The provider spending guard is open. Please try again later.",
          retryable: true,
        },
        429,
        { "Retry-After": String(error.retryAfterSeconds) },
      );
    }
    if (error instanceof ProviderNotConfiguredError || error instanceof EvidenceProviderNotConfiguredError) {
      return json(
        {
          error: "provider_not_configured",
          message: "Evidence is not configured for this environment.",
          retryable: false,
        },
        503,
      );
    }
    if (error instanceof ProviderConfigurationError) {
      return json(
        {
          error: "provider_not_configured",
          message: "HOLD provider configuration is invalid for this environment.",
          retryable: false,
        },
        503,
      );
    }
    if (error instanceof EvidenceTimeoutError || (error instanceof DOMException && error.name === "AbortError")) {
      return json(
        { error: "TIMEOUT", message: "Evidence search took too long. Please try again.", retryable: true },
        504,
      );
    }
    return json(
      { error: "EVIDENCE_FAILED", message: "Evidence could not be retrieved. Please try again.", retryable: true },
      502,
    );
  }
}
