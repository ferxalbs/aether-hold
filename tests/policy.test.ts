import { describe, expect, it } from "vitest";
import type { HoldInput, JudgmentResult } from "@/packages/core";
import { evaluatePolicy } from "@/packages/policy-engine";

const baseInput: HoldInput = { draft: "A clear professional update with a useful next step.", context: "email" };

function result(overrides: Partial<JudgmentResult> = {}): JudgmentResult {
  return {
    perceivedIntent: {
      kind: "choice",
      choice: "inform",
      confidence: 0.82,
      probabilities: { inform: 0.82, ask: 0.08, sell: 0.03, support: 0.03, vent: 0.01, attack: 0.01, unclear: 0.02 },
    },
    clarity: {
      kind: "score",
      score: 3,
      maxScore: 3,
      confidence: 0.88,
      probabilities: { "0": 0.01, "1": 0.03, "2": 0.08, "3": 0.88 },
    },
    recipientValue: {
      kind: "score",
      score: 3,
      maxScore: 3,
      confidence: 0.85,
      probabilities: { "0": 0.02, "1": 0.03, "2": 0.1, "3": 0.85 },
    },
    tone: {
      kind: "score",
      score: 0,
      maxScore: 3,
      confidence: 0.84,
      probabilities: { "0": 0.84, "1": 0.1, "2": 0.04, "3": 0.02 },
    },
    secretExposure: { kind: "noul", probability: 0.02 },
    hostility: { kind: "noul", probability: 0.02 },
    spamRisk: { kind: "noul", probability: 0.04 },
    needsVerification: { kind: "noul", probability: 0.04 },
    containsCheckableClaim: { kind: "noul", probability: 0.02 },
    claimConsequence: {
      kind: "score",
      score: 0,
      maxScore: 3,
      confidence: 0.84,
      probabilities: { "0": 0.84, "1": 0.1, "2": 0.04, "3": 0.02 },
    },
    model: "fake-test",
    ...overrides,
  };
}

describe("HOLD deterministic policy", () => {
  it("returns SEND for a clear professional draft", () => {
    expect(evaluatePolicy(baseInput, result()).verdict).toBe("SEND");
  });

  it("returns REWRITE for vague, low-value writing", () => {
    const decision = evaluatePolicy(
      { ...baseInput, context: "social-post" },
      result({ clarity: { ...result().clarity, score: 1 }, recipientValue: { ...result().recipientValue, score: 1 } }),
    );
    expect(decision.verdict).toBe("REWRITE");
    expect(decision.reasons).toEqual(expect.arrayContaining(["low-clarity", "low-recipient-value"]));
  });

  it("returns BLOCK for likely secret exposure", () => {
    const decision = evaluatePolicy(baseInput, result({ secretExposure: { kind: "noul", probability: 0.9 } }));
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.reasons).toContain("secret-exposure");
  });

  it("blocks a recognizable credential even when the provider misses it", () => {
    const decision = evaluatePolicy(
      { ...baseInput, draft: "Use this fake key: sk-test_1234567890abcdef" },
      result({ secretExposure: { kind: "noul", probability: 0.02 } }),
    );
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.reasons).toContain("secret-exposure");
  });

  it("blocks requests to paste passwords or access tokens even when the provider is uncertain", () => {
    const decision = evaluatePolicy(
      { ...baseInput, draft: "Send us your password and access token here so we can reset the account." },
      result({ secretExposure: { kind: "noul", probability: 0.2 } }),
    );
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.reasons).toContain("secret-exposure");
  });

  it("returns BLOCK for hostility, even when another rule also matches", () => {
    const decision = evaluatePolicy(
      baseInput,
      result({ hostility: { kind: "noul", probability: 0.9 }, needsVerification: { kind: "noul", probability: 0.9 } }),
    );
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.reasons).toContain("hostility");
  });

  it("returns HOLD for a claim that needs verification", () => {
    const decision = evaluatePolicy(baseInput, result({ needsVerification: { kind: "noul", probability: 0.8 } }));
    expect(decision.verdict).toBe("HOLD");
    expect(decision.reasons).toContain("needs-verification");
  });

  it("returns REWRITE for intent mismatch", () => {
    const decision = evaluatePolicy(
      { ...baseInput, intent: "Ask for a decision" },
      result({ intentAlignment: { kind: "noul", probability: 0.3 } }),
    );
    expect(decision.verdict).toBe("REWRITE");
    expect(decision.reasons).toContain("intent-mismatch");
  });

  it("returns HOLD for a high-consequence checkable claim", () => {
    const decision = evaluatePolicy(
      baseInput,
      result({
        containsCheckableClaim: { kind: "noul", probability: 0.9 },
        claimConsequence: { ...result().claimConsequence, score: 3 },
      }),
    );
    expect(decision.verdict).toBe("HOLD");
    expect(decision.reasons).toContain("high-consequence-claim");
  });

  it("rewrites aggressive tone below the block hostility threshold", () => {
    const decision = evaluatePolicy(
      baseInput,
      result({ tone: { ...result().tone, score: 2 }, hostility: { kind: "noul", probability: 0.4 } }),
    );
    expect(decision.verdict).toBe("REWRITE");
    expect(decision.reasons).toContain("aggressive-tone");
  });

  it("holds instead of treating missing conditional signals as safe", () => {
    const decision = evaluatePolicy({ ...baseInput, intent: "Resolve the issue" }, result());
    expect(decision.verdict).toBe("HOLD");
    expect(decision.reasons).toContain("missing-signal");
  });

  it("does not treat a Noul probability as Choice confidence", () => {
    const decision = evaluatePolicy(baseInput, result({ secretExposure: { kind: "noul", probability: 0.59 } }));
    expect(decision.verdict).toBe("SEND");
    expect(decision.signals.find((signal) => signal.id === "secretExposure")?.confidence).toBeUndefined();
  });
});
