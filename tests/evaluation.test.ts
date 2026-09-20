import { describe, expect, it } from "vitest";
import { EvaluationTimeoutError, evaluateHold, withEvaluationTimeout } from "@/lib/evaluation";
import type { HoldInput, JudgmentResult } from "@/packages/core";
import { FakeJudgmentProvider } from "@/packages/jev-provider";

const input: HoldInput = { draft: "A useful, calm update with a next step.", context: "email" };

async function fakeResult(): Promise<JudgmentResult> {
  return new FakeJudgmentProvider().evaluate(input, { id: "hold", version: "test", context: "email", questions: [] });
}

describe("evaluation orchestration", () => {
  it("uses exactly one provider evaluation and returns pack/policy metadata", async () => {
    let calls = 0;
    const seed = await fakeResult();
    const provider = new FakeJudgmentProvider({
      resultFactory: () => {
        calls += 1;
        return { ...seed };
      },
    });
    const response = await evaluateHold(input, { provider, mode: "fake" });
    expect(calls).toBe(1);
    expect(response.questionPackVersion).toBe("hold-questions-2.0.0-atomic");
    expect(response.policyVersion).toContain("hold-policy");
    expect(response.providerMode).toBe("fake");
    expect(response.estimatedCostUsd).toBe(0);
  });

  it("holds a concrete percentage claim in the development simulation", async () => {
    const response = await evaluateHold(
      { draft: "The change improves recovery by 20%.", context: "email" },
      { provider: new FakeJudgmentProvider(), mode: "fake" },
    );
    expect(response.verdict).toBe("HOLD");
    expect(response.reasons).toContain("needs-verification");
  });

  it("rejects malformed provider output for the route to turn into a safe error", async () => {
    const provider = { evaluate: async () => undefined as unknown as JudgmentResult };
    await expect(evaluateHold(input, { provider, mode: "fake" })).rejects.toThrow();
  });

  it("passes the request abort signal through to the provider", async () => {
    const seed = await fakeResult();
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const provider = {
      evaluate: async (_input: HoldInput, _pack: unknown, signal?: AbortSignal) => {
        received = signal;
        return seed;
      },
    };
    await evaluateHold(input, { provider, mode: "fake", signal: controller.signal });
    expect(received).toBe(controller.signal);
  });

  it("raises a typed timeout without exposing provider errors", async () => {
    await expect(withEvaluationTimeout(new Promise<string>(() => undefined), 5)).rejects.toBeInstanceOf(
      EvaluationTimeoutError,
    );
  });
});
