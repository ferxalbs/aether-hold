import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/evaluate/route";
import { evaluateHold } from "@/lib/evaluation";
import {
  isEvidenceEnabled,
  ProviderConfigurationError,
  ProviderNotConfiguredError,
  resolveProviderConfig,
  validateProviderConfiguration,
} from "@/lib/provider-config";
import type { HoldInput } from "@/packages/core";
import { createProvider, FakeJudgmentProvider } from "@/packages/jev-provider";

const input: HoldInput = { draft: "A calm professional update with a useful next step.", context: "email" };

async function withEnvironment(
  values: Record<string, string | undefined>,
  callback: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function evaluationRequest(): Request {
  return new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

describe("provider configuration", () => {
  it("requires an explicit Evidence enable flag", () => {
    expect(isEvidenceEnabled({ HOLD_EVIDENCE_ENABLED: undefined })).toBe(false);
    expect(isEvidenceEnabled({ HOLD_EVIDENCE_ENABLED: "0" })).toBe(false);
    expect(isEvidenceEnabled({ HOLD_EVIDENCE_ENABLED: "true" })).toBe(true);
  });

  it("rejects fake mode for production and Vercel production", () => {
    expect(() => validateProviderConfiguration({ NODE_ENV: "production", HOLD_PROVIDER: "fake" })).toThrow(
      ProviderConfigurationError,
    );
    expect(() =>
      validateProviderConfiguration({ NODE_ENV: "development", VERCEL_ENV: "production", HOLD_PROVIDER: "fake" }),
    ).toThrow(ProviderConfigurationError);
  });

  it("rejects fake mode outside development and test environments", () => {
    expect(() => resolveProviderConfig({ NODE_ENV: "staging", HOLD_PROVIDER: "fake" })).toThrow(
      /only allowed in development or test/,
    );
    expect(() =>
      resolveProviderConfig({ NODE_ENV: "development", VERCEL_ENV: "preview", HOLD_PROVIDER: "fake" }),
    ).not.toThrow();
    expect(() => resolveProviderConfig({ VERCEL_ENV: "preview", HOLD_PROVIDER: "fake" })).toThrow(
      /only allowed in development or test/,
    );
  });

  it("requires the real provider, limiter, salt, and spending ceiling in production", () => {
    expect(() =>
      validateProviderConfiguration({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        HOLD_PROVIDER: "typesafe",
        TYPESAFE_API_KEY: "ts-synthetic-test-key",
        UPSTASH_REDIS_REST_URL: "https://redis.example",
        UPSTASH_REDIS_REST_TOKEN: "redis-token",
        HOLD_RATE_LIMIT_SALT: "a-long-random-production-secret",
        HOLD_RATE_LIMIT_REQUESTS: "30",
        HOLD_DAILY_SPEND_USD: "10",
        HOLD_ESTIMATED_COST_PER_REQUEST_USD: "0.01",
        HOLD_EVIDENCE_ENABLED: "0",
      }),
    ).not.toThrow();

    expect(() =>
      validateProviderConfiguration({
        NODE_ENV: "production",
        HOLD_PROVIDER: "typesafe",
        TYPESAFE_API_KEY: "ts-synthetic-test-key",
        UPSTASH_REDIS_REST_URL: "https://redis.example",
        UPSTASH_REDIS_REST_TOKEN: "redis-token",
        HOLD_RATE_LIMIT_SALT: "replace-with-a-random-deployment-secret",
        HOLD_RATE_LIMIT_REQUESTS: "30",
        HOLD_DAILY_SPEND_USD: "10",
        HOLD_ESTIMATED_COST_PER_REQUEST_USD: "0.01",
      }),
    ).toThrow(/HOLD_RATE_LIMIT_SALT/);
  });

  it("requires an evidence search adapter when Evidence is enabled", () => {
    expect(() =>
      validateProviderConfiguration({
        NODE_ENV: "production",
        HOLD_PROVIDER: "typesafe",
        TYPESAFE_API_KEY: "ts-synthetic-test-key",
        UPSTASH_REDIS_REST_URL: "https://redis.example",
        UPSTASH_REDIS_REST_TOKEN: "redis-token",
        HOLD_RATE_LIMIT_SALT: "a-long-random-production-secret",
        HOLD_RATE_LIMIT_REQUESTS: "30",
        HOLD_DAILY_SPEND_USD: "10",
        HOLD_ESTIMATED_COST_PER_REQUEST_USD: "0.01",
        HOLD_EVIDENCE_ENABLED: "1",
        HOLD_EVIDENCE_DAILY_SPEND_USD: "2",
      }),
    ).toThrow(/EVIDENCE_SEARCH_URL/);
  });

  it("requires an evidence-specific spending ceiling when Evidence is enabled", () => {
    expect(() =>
      validateProviderConfiguration({
        NODE_ENV: "production",
        HOLD_PROVIDER: "typesafe",
        TYPESAFE_API_KEY: "ts-synthetic-test-key",
        UPSTASH_REDIS_REST_URL: "https://redis.example",
        UPSTASH_REDIS_REST_TOKEN: "redis-token",
        HOLD_RATE_LIMIT_SALT: "a-long-random-production-secret",
        HOLD_RATE_LIMIT_REQUESTS: "30",
        HOLD_DAILY_SPEND_USD: "10",
        HOLD_ESTIMATED_COST_PER_REQUEST_USD: "0.01",
        HOLD_EVIDENCE_ENABLED: "1",
        EVIDENCE_SEARCH_URL: "https://search.example/api",
        EVIDENCE_SEARCH_API_KEY: "search-key",
      }),
    ).toThrow(/HOLD_EVIDENCE_DAILY_SPEND_USD|HOLD_EVIDENCE_HOURLY_SPEND_USD/);
  });

  it("rejects an unsafe Evidence endpoint during production preflight", () => {
    expect(() =>
      validateProviderConfiguration({
        NODE_ENV: "production",
        HOLD_PROVIDER: "typesafe",
        TYPESAFE_API_KEY: "ts-synthetic-test-key",
        UPSTASH_REDIS_REST_URL: "https://redis.example",
        UPSTASH_REDIS_REST_TOKEN: "redis-token",
        HOLD_RATE_LIMIT_SALT: "a-long-random-production-secret",
        HOLD_RATE_LIMIT_REQUESTS: "30",
        HOLD_DAILY_SPEND_USD: "10",
        HOLD_ESTIMATED_COST_PER_REQUEST_USD: "0.01",
        HOLD_EVIDENCE_ENABLED: "1",
        EVIDENCE_SEARCH_URL: "javascript:alert(1)",
        EVIDENCE_SEARCH_API_KEY: "search-key",
        HOLD_EVIDENCE_DAILY_SPEND_USD: "2",
      }),
    ).toThrow(/EVIDENCE_SEARCH_URL must be an HTTP\(S\) endpoint/);
  });

  it("cannot select the fake provider at runtime in production", async () => {
    await withEnvironment(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        HOLD_PROVIDER: "fake",
        TYPESAFE_API_KEY: "ts-synthetic-test-key",
      },
      async () => {
        expect(() => createProvider()).toThrow(ProviderConfigurationError);
      },
    );
  });

  it("does not select fake implicitly when a development key is missing", () => {
    expect(resolveProviderConfig({ NODE_ENV: "development" })).toMatchObject({
      mode: "typesafe",
      isDevelopmentSimulation: false,
      hasApiKey: false,
    });
  });

  it("keeps explicitly configured fake mode available in development", async () => {
    await withEnvironment(
      { NODE_ENV: "development", VERCEL_ENV: undefined, HOLD_PROVIDER: "fake", TYPESAFE_API_KEY: undefined },
      async () => {
        const selected = createProvider();
        expect(selected.mode).toBe("fake");
        const response = await evaluateHold(input, selected);
        expect(response.providerMode).toBe("fake");
        expect(response.model).toBe("fake-jev-local");
      },
    );
  });

  it("returns a safe 503 when production has no real provider credentials", async () => {
    await withEnvironment(
      { NODE_ENV: "production", VERCEL_ENV: "production", HOLD_PROVIDER: "typesafe", TYPESAFE_API_KEY: undefined },
      async () => {
        const response = await POST(evaluationRequest());
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
          error: "provider_not_configured",
          message: "HOLD is not configured for a real Jev provider. Please add TYPESAFE_API_KEY and try again.",
          retryable: false,
        });
      },
    );
  });

  it("returns a safe configuration error when production selects fake mode", async () => {
    await withEnvironment({ NODE_ENV: "production", VERCEL_ENV: "production", HOLD_PROVIDER: "fake" }, async () => {
      const response = await POST(evaluationRequest());
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "provider_not_configured",
        message: "HOLD provider configuration is invalid for this environment.",
        retryable: false,
      });
    });
  });

  it("does not turn provider failures into a verdict", async () => {
    await withEnvironment(
      { NODE_ENV: "development", VERCEL_ENV: undefined, HOLD_PROVIDER: "fake", HOLD_FAKE_FAILURE: "1" },
      async () => {
        await expect(evaluateHold(input, { provider: new FakeJudgmentProvider(), mode: "fake" })).rejects.toThrow();
        const response = await POST(evaluationRequest());
        expect(response.status).toBe(502);
        const body = (await response.json()) as Record<string, unknown>;
        expect(body).not.toHaveProperty("verdict");
        expect(body).toMatchObject({ error: "EVALUATION_FAILED", retryable: true });
      },
    );
  });

  it("throws a typed error before constructing a real client without a key", async () => {
    await withEnvironment(
      { NODE_ENV: "production", VERCEL_ENV: undefined, HOLD_PROVIDER: "typesafe", TYPESAFE_API_KEY: undefined },
      async () => {
        expect(() => createProvider()).toThrow(ProviderNotConfiguredError);
      },
    );
  });
});
