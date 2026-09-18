import { describe, expect, it } from "vitest";
import type { HoldInput } from "@/packages/core";
import { createPackForInput, TypeSafeJudgmentProvider } from "@/packages/jev-provider";

const input: HoldInput = {
  draft: "A clear professional update with a useful next step.",
  context: "email",
};

const providerResponse = {
  model: "jev-test",
  answers: {
    recommendedAction: {
      type: "choice",
      choice: "send",
      confidence: 0.91,
      probabilities: { send: 0.91, rewrite: 0.04, hold: 0.03, block: 0.02 },
    },
    perceivedIntent: {
      type: "choice",
      choice: "inform",
      confidence: 0.88,
      probabilities: { inform: 0.88, ask: 0.05, sell: 0.02, support: 0.02, vent: 0.01, attack: 0.01, unclear: 0.01 },
    },
    clarity: {
      type: "score",
      score: 3,
      confidence: 0.89,
      legend: { "0": "low", "1": "limited", "2": "clear", "3": "excellent" },
      probabilities: { "0": 0.01, "1": 0.02, "2": 0.08, "3": 0.89 },
    },
    recipientValue: {
      type: "score",
      score: 3,
      confidence: 0.86,
      legend: { "0": "low", "1": "limited", "2": "clear", "3": "excellent" },
      probabilities: { "0": 0.01, "1": 0.03, "2": 0.1, "3": 0.86 },
    },
    tone: {
      type: "score",
      score: 0,
      confidence: 0.9,
      legend: { "0": "calm", "1": "tense", "2": "aggressive", "3": "abusive" },
      probabilities: { "0": 0.9, "1": 0.06, "2": 0.03, "3": 0.01 },
    },
    secretExposure: { type: "noul", noul: 0.01 },
    hostility: { type: "noul", noul: 0.02 },
    spamRisk: { type: "noul", noul: 0.03 },
    needsVerification: { type: "noul", noul: 0.04 },
  },
  usage: { input_tokens: 123, output_tokens: 45 },
};

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

describe("TypeSafe Jev provider transport", () => {
  it("makes exactly one SDK request and preserves model and usage metadata", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    let fetchCallCount = 0;
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCallCount += 1;
      calls.push({ input, init });
      return new Response(JSON.stringify(providerResponse), {
        status: 200,
        headers: { "content-type": "application/json", "x-typesafe-request-id": "jev-test-request" },
      });
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      await withEnvironment(
        {
          NODE_ENV: "test",
          VERCEL_ENV: undefined,
          HOLD_PROVIDER: "typesafe",
          TYPESAFE_API_KEY: "ts-synthetic-test-key",
        },
        async () => {
          const provider = new TypeSafeJudgmentProvider();
          const result = await provider.evaluate(input, createPackForInput(input));

          expect(fetchCallCount).toBe(1);
          expect(calls[0]?.input.toString()).toContain("/v1/systemone");
          expect(result.model).toBe("jev-test");
          expect(result.usage).toEqual({ inputTokens: 123, outputTokens: 45 });
          expect(result.recommendedAction.confidence).toBe(0.91);
          expect(result.clarity.confidence).toBe(0.89);
          expect(result.needsVerification.probability).toBe(0.04);
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
