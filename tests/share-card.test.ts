import { describe, expect, it } from "vitest";
import { buildShareCardSvg, getTopSignals } from "@/components/hold/share-card";
import type { EvaluationResponse, EvidenceResponse } from "@/packages/core";

const result: EvaluationResponse = {
  verdict: "REWRITE",
  reasons: ["low-clarity"],
  reasonLabels: ["Clarity is below threshold"],
  signals: [
    {
      id: "clarity",
      label: "Clarity < risky & ready",
      value: 0.2,
      displayValue: "20%",
      direction: "higher-is-better",
      confidence: 0.9,
    },
    { id: "tone", label: "Tone risk", value: 0.8, displayValue: "Aggressive", direction: "higher-is-risk" },
    { id: "recipientValue", label: "Recipient value", value: 0.7, displayValue: "70%", direction: "higher-is-better" },
    { id: "perceivedIntent", label: "Perceived intent", value: 0.4, displayValue: "inform", direction: "categorical" },
  ],
  policyVersion: "hold-policy-2.0.0-atomic",
  questionPackVersion: "hold-questions-2.0.0-atomic",
  model: "jev-latest",
  latencyMs: 143,
  estimatedCostUsd: 0.0004,
  usage: { inputTokens: 120, outputTokens: 40 },
  providerMode: "typesafe",
  evidenceStatus: "NOT_NEEDED",
  experimental: true,
};

const evidence: EvidenceResponse = {
  status: "SUPPORTED",
  claim: {
    sentenceId: "sentence-1",
    text: "The change improves recovery by 20% & keeps the draft private.",
    existenceProbability: 0.9,
    consequenceScore: 2,
    selectionConfidence: 0.8,
  },
  candidates: [
    {
      id: "source-1",
      title: "Independent source",
      url: "https://example.com/source",
      snippet: "A source.",
      source: "example.com",
      originalRank: 1,
    },
  ],
  supportCount: 1,
  disputeCount: 0,
  independentDomainCount: 1,
  partialFailure: false,
  receipt: {
    latencyMs: 100,
    estimatedCostUsd: 0.0001,
    model: "jev-latest",
    requestCount: 3,
    provider: "test",
  },
  policyVersion: "hold-evidence-policy-1.0.0",
};

describe("share-card output", () => {
  it("prioritizes the signal mapped to a policy reason", () => {
    expect(getTopSignals(result)[0]?.id).toBe("clarity");
  });

  it("is self-contained, escaped, and never leaks the submitted draft", () => {
    const svg = buildShareCardSvg(result);
    expect(svg).toContain("Clarity &lt; risky &amp; ready");
    expect(svg).toContain("quality");
    expect(svg).not.toContain("fonts.googleapis");
    expect(svg).not.toContain("According to");
    expect(svg).not.toContain("the submitted draft");
  });

  it("labels fixture share cards as simulations", () => {
    expect(buildShareCardSvg({ ...result, providerMode: "fake" })).toContain("Development simulation");
  });

  it("keeps the default card draft-free and requires explicit claim opt-in", () => {
    const draftFree = buildShareCardSvg({ ...result, evidenceStatus: "SUPPORTED" }, { evidence });
    expect(draftFree).toContain("Evidence: SUPPORTED");
    expect(draftFree).toContain("1 sources · 1 support · 0 dispute");
    expect(draftFree).not.toContain("recovery by 20%");

    const optedIn = buildShareCardSvg({ ...result, evidenceStatus: "SUPPORTED" }, { evidence, includeClaim: true });
    expect(optedIn).toContain("Claim included by explicit user choice:");
    expect(optedIn).toContain("recovery by 20% &amp;");
  });

  it("keeps mixed Evidence visible in the default card metadata", () => {
    const mixedEvidence = {
      ...evidence,
      status: "MIXED" as const,
      candidates: [
        ...evidence.candidates,
        { ...evidence.candidates[0], id: "source-2", url: "https://other.example/source" },
      ],
      supportCount: 1,
      disputeCount: 1,
    };
    const svg = buildShareCardSvg({ ...result, evidenceStatus: "MIXED" }, { evidence: mixedEvidence });
    expect(svg).toContain("Evidence: MIXED");
    expect(svg).toContain("2 sources · 1 support · 1 dispute");
    expect(svg).not.toContain("Claim included by explicit user choice:");
  });

  it("bounds long unbroken claim text in the opt-in card", () => {
    const longClaim = `https://${"x".repeat(240)}`;
    const claim = evidence.claim;
    if (!claim) throw new Error("Evidence fixture claim is required");
    const svg = buildShareCardSvg(
      { ...result, evidenceStatus: "SUPPORTED" },
      { evidence: { ...evidence, claim: { ...claim, text: longClaim } }, includeClaim: true },
    );
    expect(svg).not.toContain(longClaim);
    expect(svg).toContain("Claim included by explicit user choice:");
  });

  it("labels categorical intent as informational instead of quality", () => {
    const svg = buildShareCardSvg({ ...result, reasons: [], reasonLabels: [] });
    expect(svg).toContain("Perceived intent · informational");
    expect(svg).toContain("Informational categorical · confidence");
  });
});
