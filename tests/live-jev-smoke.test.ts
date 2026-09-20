import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixture from "@/calibration/hold-calibration-v2.json";
import { withEvaluationTimeout } from "@/lib/evaluation";
import { estimateCostUsd } from "@/lib/pricing";
import type { HoldInput, JudgmentResult, Verdict } from "@/packages/core";
import { REASON_LABELS } from "@/packages/core";
import { createPackForInput, TypeSafeJudgmentProvider } from "@/packages/jev-provider";
import { evaluatePolicy, POLICY_VERSION } from "@/packages/policy-engine";
import { QUESTION_PACK_VERSION } from "@/packages/question-packs";

type SmokeCase = {
  id: string;
  description: string;
  input: HoldInput;
  expectedVerdict: Verdict;
};

type CalibrationCase = {
  id: string;
  context: HoldInput["context"];
  draft: string;
  audience?: string;
  intent?: string;
  conversationContext?: string;
  expectedVerdict: Verdict;
};

type LiveEvaluationRecord = {
  id: string;
  description?: string;
  input: HoldInput;
  humanExpectedVerdict?: Verdict;
  normalizedSignals: ReturnType<typeof evaluatePolicy>["signals"];
  choiceConfidence: Record<string, number>;
  scoreConfidence: Record<string, number>;
  noulProbabilities: Record<string, number>;
  deterministicPolicyRules: ReturnType<typeof evaluatePolicy>["reasons"];
  deterministicPolicyRuleLabels: string[];
  verdict: Verdict;
  uncertain: boolean;
  uncertaintyReasons: string[];
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  model: string;
  jevRequestCount: number;
  policyVersion: string;
  questionPackVersion: string;
};

const smokeCases: SmokeCase[] = [
  {
    id: "meaningless",
    description: "Meaningless text",
    input: { draft: "aaaa", context: "email" },
    expectedVerdict: "REWRITE",
  },
  {
    id: "professional-email",
    description: "Clear professional email",
    input: {
      draft:
        "Hi team, the release is ready for review. Please add comments by Friday so we can decide on the launch date.",
      context: "email",
      audience: "The product team",
      intent: "Coordinate a clear review and launch decision",
    },
    expectedVerdict: "SEND",
  },
  {
    id: "aggressive-sales",
    description: "Aggressive sales email",
    input: {
      draft:
        "You clearly do not understand what you are missing. This is your last chance to buy before the price doubles. Click here now.",
      context: "email",
      audience: "A prospective customer",
      intent: "Start a useful conversation without pressure",
    },
    expectedVerdict: "REWRITE",
  },
  {
    id: "hostile-support",
    description: "Hostile support reply",
    input: {
      draft:
        "We already told you this is being worked on. Stop sending the same message. It is not our fault you cannot follow basic instructions.",
      context: "support-reply",
      intent: "Resolve the customer's login issue and rebuild trust",
      conversationContext:
        "The customer says they have been locked out since the update and asks when access will be restored.",
    },
    expectedVerdict: "BLOCK",
  },
  {
    id: "fake-credential",
    description: "Synthetic fake credential",
    input: {
      draft: "For the test account only, use this fake credential: sk-test_1234567890abcdef.",
      context: "email",
    },
    expectedVerdict: "BLOCK",
  },
  {
    id: "factual-claim",
    description: "Claim requiring verification",
    input: {
      draft: "According to the latest research, this change will save 40% of the team's time.",
      context: "email",
      audience: "The project reviewers",
      intent: "Share a claim that should be checked before publication",
    },
    expectedVerdict: "HOLD",
  },
  {
    id: "intent-mismatch",
    description: "Intent-mismatched draft",
    input: {
      draft: "Here is our latest promotion. Click here to buy now, even though your stated goal was to de-escalate.",
      context: "email",
      intent: "Apologize and de-escalate after a misunderstanding",
    },
    expectedVerdict: "REWRITE",
  },
  {
    id: "ignores-customer-request",
    description: "Reply ignores customer request",
    input: {
      draft: "Thanks for reaching out. We are always innovating and appreciate your patience.",
      context: "support-reply",
      conversationContext: "The customer asks how to reset their password after being locked out.",
    },
    expectedVerdict: "REWRITE",
  },
];

const liveEnabled =
  process.env.RUN_LIVE_JEV === "1" &&
  Boolean(process.env.TYPESAFE_API_KEY?.trim()) &&
  [undefined, "", "typesafe"].includes(process.env.HOLD_PROVIDER?.trim().toLowerCase());
const outputPath = path.resolve(process.cwd(), "calibration/live-jev-smoke.latest.json");
const reportPath = path.resolve(process.cwd(), "calibration/hold-calibration-report.md");

let provider: TypeSafeJudgmentProvider;
let originalFetch: typeof fetch;
let fetchCount = 0;
const requestedModels: string[] = [];

function signalsFor(result: JudgmentResult, input: HoldInput, providerResult: ReturnType<typeof evaluatePolicy>) {
  return {
    normalizedSignals: providerResult.signals,
    choiceConfidence: {
      perceivedIntent: result.perceivedIntent.confidence,
    },
    scoreConfidence: {
      clarity: result.clarity.confidence,
      recipientValue: result.recipientValue.confidence,
      tone: result.tone.confidence,
      claimConsequence: result.claimConsequence.confidence,
    },
    noulProbabilities: {
      secretExposure: result.secretExposure.probability,
      hostility: result.hostility.probability,
      spamRisk: result.spamRisk.probability,
      needsVerification: result.needsVerification.probability,
      containsCheckableClaim: result.containsCheckableClaim.probability,
      ...(result.addressesRequest ? { addressesRequest: result.addressesRequest.probability } : {}),
      ...(result.intentAlignment ? { intentAlignment: result.intentAlignment.probability } : {}),
    },
    deterministicPolicyRules: providerResult.reasons,
    deterministicPolicyRuleLabels: providerResult.reasons.map((reason) => REASON_LABELS[reason]),
    verdict: providerResult.verdict,
    input,
  };
}

function uncertaintyFor(result: JudgmentResult): string[] {
  const reasons: string[] = [];
  if (result.clarity.confidence < 0.6) reasons.push("low-clarity-confidence");
  if (result.recipientValue.confidence < 0.6) reasons.push("low-recipient-value-confidence");
  if (result.tone.confidence < 0.6) reasons.push("low-tone-confidence");

  const noulSignals = [
    ["secretExposure", result.secretExposure.probability],
    ["hostility", result.hostility.probability],
    ["spamRisk", result.spamRisk.probability],
    ["needsVerification", result.needsVerification.probability],
    ["containsCheckableClaim", result.containsCheckableClaim.probability],
    ...(result.addressesRequest ? [["addressesRequest", result.addressesRequest.probability] as const] : []),
    ...(result.intentAlignment ? [["intentAlignment", result.intentAlignment.probability] as const] : []),
  ] as const;
  for (const [name, probability] of noulSignals) {
    if (probability >= 0.4 && probability <= 0.6) reasons.push(`ambiguous-${name}`);
  }
  return reasons;
}

async function evaluateLiveCase(
  id: string,
  input: HoldInput,
  description?: string,
  humanExpectedVerdict?: Verdict,
): Promise<LiveEvaluationRecord> {
  const requestCountBefore = fetchCount;
  const started = performance.now();
  const pack = createPackForInput(input);
  const result = await withEvaluationTimeout(provider.evaluate(input, pack));
  const decision = evaluatePolicy(input, result);
  const requestCount = fetchCount - requestCountBefore;
  const latencyMs = Math.max(1, Math.round(performance.now() - started));

  expect(requestCount).toBe(1);

  const signalData = signalsFor(result, input, decision);
  const uncertaintyReasons = uncertaintyFor(result);
  return {
    id,
    ...(description ? { description } : {}),
    input,
    ...(humanExpectedVerdict ? { humanExpectedVerdict } : {}),
    normalizedSignals: signalData.normalizedSignals,
    choiceConfidence: signalData.choiceConfidence,
    scoreConfidence: signalData.scoreConfidence,
    noulProbabilities: signalData.noulProbabilities,
    deterministicPolicyRules: signalData.deterministicPolicyRules,
    deterministicPolicyRuleLabels: signalData.deterministicPolicyRuleLabels,
    verdict: signalData.verdict,
    uncertain: uncertaintyReasons.length > 0,
    uncertaintyReasons,
    latencyMs,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
    estimatedCostUsd: estimateCostUsd(result.usage, "typesafe"),
    model: result.model,
    jevRequestCount: requestCount,
    policyVersion: decision.policyVersion,
    questionPackVersion: pack.version,
  };
}

async function writeLiveArtifacts(smoke: LiveEvaluationRecord[], calibration: LiveEvaluationRecord[]): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), provider: "typesafe", smoke, calibration }, null, 2)}\n`,
    "utf8",
  );

  const agreement = calibration.filter((record) => record.verdict === record.humanExpectedVerdict);
  const disagreement = calibration.filter((record) => record.verdict !== record.humanExpectedVerdict);
  const uncertain = calibration.filter((record) => record.uncertain);
  const counts = (verdict: Verdict) => calibration.filter((record) => record.verdict === verdict).length;
  const sortedLatencies = calibration.map((record) => record.latencyMs).sort((a, b) => a - b);
  const percentile = (values: number[], p: number) =>
    values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] ?? null;
  const inputTokens = calibration
    .map((record) => record.inputTokens)
    .filter((value): value is number => value !== null);
  const outputTokens = calibration
    .map((record) => record.outputTokens)
    .filter((value): value is number => value !== null);
  const costs = calibration.map((record) => record.estimatedCostUsd).filter((value): value is number => value !== null);
  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const modelIds = [...new Set(calibration.map((record) => record.model))];
  const verdictAgreement = (verdict: Verdict) => {
    const cases = calibration.filter((record) => record.humanExpectedVerdict === verdict);
    const matches = cases.filter((record) => record.verdict === verdict).length;
    return { matches, total: cases.length, percent: cases.length ? (matches / cases.length) * 100 : 0 };
  };
  const confusion = Object.fromEntries(
    (["SEND", "REWRITE", "HOLD", "BLOCK"] as const).map((expected) => [
      expected,
      Object.fromEntries(
        (["SEND", "REWRITE", "HOLD", "BLOCK"] as const).map((actual) => [
          actual,
          calibration.filter((record) => record.humanExpectedVerdict === expected && record.verdict === actual).length,
        ]),
      ),
    ]),
  );
  const report = `# HOLD calibration report

Fixture: \`hold-calibration-v2\`

Live TypeSafe Jev run generated at ${new Date().toISOString()}. Human expected labels come from the versioned fixture and are not overwritten by model output.

| Category | Count |
| --- | ---: |
| Agreement | ${agreement.length} |
| Disagreement | ${disagreement.length} |
| Uncertain cases | ${uncertain.length} |
| Overall agreement | ${((agreement.length / Math.max(1, calibration.length)) * 100).toFixed(1)}% |
| Critical BLOCK false negatives | ${calibration.filter((record) => record.humanExpectedVerdict === "BLOCK" && record.verdict !== "BLOCK").length} |
| p50 latency | ${percentile(sortedLatencies, 0.5)} ms |
| p95 latency | ${percentile(sortedLatencies, 0.95)} ms |
| Average input tokens | ${average(inputTokens) === null ? "n/a" : Math.round(average(inputTokens) as number)} |
| Maximum input tokens | ${inputTokens.length ? Math.max(...inputTokens) : "n/a"} |
| Average output tokens | ${average(outputTokens) === null ? "n/a" : Math.round(average(outputTokens) as number)} |
| Maximum output tokens | ${outputTokens.length ? Math.max(...outputTokens) : "n/a"} |
| Average estimated cost | ${average(costs) === null ? "n/a" : `$${(average(costs) as number).toFixed(6)}`} |
| Maximum estimated cost | ${costs.length ? `$${Math.max(...costs).toFixed(6)}` : "n/a"} |

## Model verdict distribution

| Verdict | Count |
| --- | ---: |
| SEND | ${counts("SEND")} |
| REWRITE | ${counts("REWRITE")} |
| HOLD | ${counts("HOLD")} |
| BLOCK | ${counts("BLOCK")} |

## Agreement by human-expected verdict

| Expected verdict | Agreement | Cases | Agreement rate |
| --- | ---: | ---: | ---: |
| SEND | ${verdictAgreement("SEND").matches} | ${verdictAgreement("SEND").total} | ${verdictAgreement("SEND").percent.toFixed(1)}% |
| REWRITE | ${verdictAgreement("REWRITE").matches} | ${verdictAgreement("REWRITE").total} | ${verdictAgreement("REWRITE").percent.toFixed(1)}% |
| HOLD | ${verdictAgreement("HOLD").matches} | ${verdictAgreement("HOLD").total} | ${verdictAgreement("HOLD").percent.toFixed(1)}% |
| BLOCK | ${verdictAgreement("BLOCK").matches} | ${verdictAgreement("BLOCK").total} | ${verdictAgreement("BLOCK").percent.toFixed(1)}% |

## Gate metadata

- Models: ${modelIds.join(", ") || "n/a"}
- Requested model: ${process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest"}
- Question pack: ${calibration[0]?.questionPackVersion ?? QUESTION_PACK_VERSION}
- Policy: ${calibration[0]?.policyVersion ?? POLICY_VERSION}
- One Jev request per communication evaluation: ${calibration.every((record) => record.jevRequestCount === 1) ? "yes" : "no"}

## Confusion matrix

\`\`\`json
${JSON.stringify(confusion, null, 2)}
\`\`\`

## Review queue

- Disagreement IDs: ${disagreement.map((record) => record.id).join(", ") || "none"}
- Uncertain case IDs: ${uncertain.map((record) => record.id).join(", ") || "none"}

The full disagreement and uncertainty records are preserved in \`calibration/live-jev-smoke.latest.json\` for review. No thresholds were tuned by this run.
`;
  await writeFile(reportPath, report, "utf8");
}

describe.skipIf(!liveEnabled)("opt-in live Jev smoke and calibration", () => {
  beforeAll(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCount += 1;
      try {
        const body = JSON.parse(String(init?.body)) as { model?: unknown };
        if (typeof body.model === "string") requestedModels.push(body.model);
      } catch {
        // The live transport test only records the optional model field.
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    provider = new TypeSafeJudgmentProvider();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("runs the critical synthetic smoke cases with one Jev request each", async () => {
    const smoke = [];
    for (const smokeCase of smokeCases) {
      smoke.push(
        await evaluateLiveCase(smokeCase.id, smokeCase.input, smokeCase.description, smokeCase.expectedVerdict),
      );
    }

    expect(smoke).toHaveLength(8);
    expect(smoke.every((record) => record.jevRequestCount === 1)).toBe(true);

    const calibration = [];
    for (const calibrationCase of fixture.cases as CalibrationCase[]) {
      const input: HoldInput = {
        draft: calibrationCase.draft,
        context: calibrationCase.context,
        ...(calibrationCase.audience ? { audience: calibrationCase.audience } : {}),
        ...(calibrationCase.intent ? { intent: calibrationCase.intent } : {}),
        ...(calibrationCase.conversationContext ? { conversationContext: calibrationCase.conversationContext } : {}),
      };
      calibration.push(await evaluateLiveCase(calibrationCase.id, input, undefined, calibrationCase.expectedVerdict));
    }

    await writeLiveArtifacts(smoke, calibration);
    expect(smoke.every((record) => record.verdict === record.humanExpectedVerdict)).toBe(true);
    expect(smoke.find((record) => record.id === "meaningless")?.verdict).not.toBe("SEND");
    expect(
      smoke.filter((record) => ["fake-credential"].includes(record.id)).every((record) => record.verdict === "BLOCK"),
    ).toBe(true);
    expect(smoke.find((record) => record.id === "hostile-support")?.verdict).toBe("BLOCK");
    expect(calibration).toHaveLength(60);
    expect(calibration.every((record) => record.jevRequestCount === 1)).toBe(true);
    const expectedModel = process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest";
    expect(requestedModels).toHaveLength(68);
    expect(requestedModels.every((model) => model === expectedModel)).toBe(true);
    expect([...new Set(calibration.map((record) => record.model))]).toHaveLength(1);
    expect(
      calibration.filter((record) => record.verdict === record.humanExpectedVerdict).length / calibration.length,
    ).toBeGreaterThanOrEqual(0.8);
    const blockCases = calibration.filter((record) => record.humanExpectedVerdict === "BLOCK");
    expect(blockCases.filter((record) => record.verdict === "BLOCK")).toHaveLength(blockCases.length);
  }, 360_000);
});
