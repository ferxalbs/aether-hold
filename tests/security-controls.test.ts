import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  recordProviderSpend,
  reserveProviderBudget,
  resetSpendingBudgetForTests,
  SpendingGuardOpenError,
} from "@/lib/spending";

async function withEnvironment(
  values: Record<string, string | undefined>,
  callback: () => Promise<void> | void,
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

describe("server-side abuse and spending controls", () => {
  afterEach(() => {
    resetSpendingBudgetForTests();
  });

  it("uses one Redis EVAL pipeline call with a fixed-window TTL", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });
      return new Response(JSON.stringify([{ result: [2, 47] }]), { status: 200 });
    }) as typeof fetch;

    try {
      await withEnvironment(
        {
          UPSTASH_REDIS_REST_URL: "https://redis.example/",
          UPSTASH_REDIS_REST_TOKEN: "redis-token",
          HOLD_RATE_LIMIT_SALT: "test-only-salt",
          HOLD_RATE_LIMIT_REQUESTS: "1",
          HOLD_RATE_LIMIT_WINDOW_SECONDS: "60",
        },
        async () => {
          const result = await checkRateLimit(
            new Request("https://hold.example/api/evaluate", { headers: { "x-forwarded-for": "203.0.113.5" } }),
          );
          expect(result).toEqual({ enabled: true, allowed: false, remaining: 0, retryAfterSeconds: 47 });
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://redis.example/pipeline");
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer redis-token" });
    const pipeline = JSON.parse(String(calls[0]?.init?.body)) as string[][];
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0]?.[0]).toBe("EVAL");
    expect(pipeline[0]?.[1]).toContain("INCR");
    expect(pipeline[0]?.[1]).toContain("if count == 1 then redis.call('EXPIRE'");
    expect(pipeline[0]?.[3]).toMatch(/^hold:rate:communication:[a-f0-9]{24}$/);
  });

  it("allows an unconfigured limiter locally without attempting network access", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;
    try {
      await withEnvironment(
        {
          UPSTASH_REDIS_REST_URL: undefined,
          UPSTASH_REDIS_REST_TOKEN: undefined,
          HOLD_RATE_LIMIT_SALT: undefined,
        },
        async () => {
          await expect(checkRateLimit(new Request("https://hold.example/api/evaluate"))).resolves.toMatchObject({
            enabled: false,
            allowed: true,
          });
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(called).toBe(false);
  });

  it("opens before a request when the server-side minute budget is exhausted", async () => {
    await withEnvironment(
      {
        HOLD_MAX_REQUESTS_PER_MINUTE: "1",
        HOLD_HOURLY_SPEND_USD: undefined,
        HOLD_DAILY_SPEND_USD: undefined,
        HOLD_ESTIMATED_COST_PER_REQUEST_USD: "0.01",
      },
      () => {
        reserveProviderBudget("communication");
        expect(() => reserveProviderBudget("communication")).toThrow(SpendingGuardOpenError);
        try {
          reserveProviderBudget("communication");
        } catch (error) {
          expect(error).toBeInstanceOf(SpendingGuardOpenError);
          expect((error as SpendingGuardOpenError).retryAfterSeconds).toBeGreaterThan(0);
        }
      },
    );
  });

  it("enforces hourly spend and ignores non-positive accounting noise", async () => {
    await withEnvironment(
      {
        HOLD_MAX_REQUESTS_PER_MINUTE: undefined,
        HOLD_HOURLY_SPEND_USD: "0.02",
        HOLD_DAILY_SPEND_USD: undefined,
        HOLD_ESTIMATED_COST_PER_REQUEST_USD: "0.02",
      },
      () => {
        reserveProviderBudget("evidence");
        expect(() => reserveProviderBudget("evidence")).toThrow(SpendingGuardOpenError);
        recordProviderSpend("evidence", 0);
        recordProviderSpend("evidence", -1);
      },
    );
  });

  it("uses the evidence-specific spend ceiling for evidence work", async () => {
    await withEnvironment(
      {
        HOLD_MAX_REQUESTS_PER_MINUTE: undefined,
        HOLD_HOURLY_SPEND_USD: "100",
        HOLD_EVIDENCE_HOURLY_SPEND_USD: "0.02",
        HOLD_DAILY_SPEND_USD: undefined,
        HOLD_EVIDENCE_DAILY_SPEND_USD: undefined,
        HOLD_ESTIMATED_COST_PER_REQUEST_USD: "0.02",
      },
      () => {
        reserveProviderBudget("communication");
        reserveProviderBudget("evidence");
        expect(() => reserveProviderBudget("evidence")).toThrow(SpendingGuardOpenError);
      },
    );
  });
});
