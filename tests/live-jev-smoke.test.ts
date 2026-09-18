import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixture from "@/calibration/hold-calibration-v1.json";
import { withEvaluationTimeout } from "@/lib/evaluation";
import { estimateCostUsd } from "@/lib/pricing";
import type { HoldInput, JudgmentResult, Verdict } from "@/packages/core";
import { REASON_LABELS } from "@/packages/core";
import { createPackForInput, TypeSafeJudgmentProvider } from "@/packages/jev-provider";
import { evaluatePolicy } from "@/packages/policy-engine";

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
];

const liveEnabled =
  process.env.RUN_LIVE_JEV === "1" &&
  Boolean(process.env.TYPESAFE_API_KEY?.trim()) &&
  process.env.HOLD_PROVIDER?.trim().toLowerCase() !== "fake";
const outputPath = path.resolve(process.cwd(), "calibration/live-jev-smoke.latest.json");
const reportPath = path.resolve(process.cwd(), "calibration/hold-calibration-report.md");

let provider: TypeSafeJudgmentProvider;
let originalFetch: typeof fetch;
let fetchCount = 0;

function signalsFor(result: JudgmentResult, input: HoldInput, providerResult: ReturnType<typeof evaluatePolicy>) {
  return {
    normalizedSignals: providerResult.signals,
    choiceConfidence: {
      recommendedAction: result.recommendedAction.confidence,
      perceivedIntent: result.perceivedIntent.confidence,
    },
    scoreConfidence: {
      clarity: result.clarity.confidence,
      recipientValue: result.recipientValue.confidence,
      tone: result.tone.confidence,
    },
    noulProbabilities: {
      secretExposure: result.secretExposure.probability,
      hostility: result.hostility.probability,
      spamRisk: result.spamRisk.probability,
      needsVerification: result.needsVerification.probability,
      ...(result.addressesRequest ? { addressesRequest: result.addressesRequest.probability } : {}),
      ...(result.intentAlignment ? { intentAlignment: result.intentAlignment.probability } : {}),
    },
    deterministicPolicyRules: providerResult.reasons,
    deterministicPolicyRuleLabels: providerResult.reasons.map((reason) => REASON_LABELS[reason]),
    verdict: providerResult.verdict,
    input,
  };
}

function uncertaintyFor(result: JudgmentResult, decision: ReturnType<typeof evaluatePolicy>): string[] {
  const reasons: string[] = [];
  if (result.recommendedAction.confidence < 0.6) reasons.push("low-action-confidence");
  if (result.clarity.confidence < 0.6) reasons.push("low-clarity-confidence");
  if (result.recipientValue.confidence < 0.6) reasons.push("low-recipient-value-confidence");
  if (result.tone.confidence < 0.6) reasons.push("low-tone-confidence");

  const noulSignals = [
    ["secretExposure", result.secretExposure.probability],
    ["hostility", result.hostility.probability],
    ["spamRisk", result.spamRisk.probability],
    ["needsVerification", result.needsVerification.probability],
    ...(result.addressesRequest ? [["addressesRequest", result.addressesRequest.probability] as const] : []),
    ...(result.intentAlignment ? [["intentAlignment", result.intentAlignment.probability] as const] : []),
  ] as const;
  for (const [name, probability] of noulSignals) {
    if (probability >= 0.4 && probability <= 0.6) reasons.push(`ambiguous-${name}`);
  }
  if (decision.verdict === "HOLD") reasons.push("policy-hold");
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
  const uncertaintyReasons = uncertaintyFor(result, decision);
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
  const report = `# HOLD calibration report

Fixture: \`hold-calibration-v1\`

Live TypeSafe Jev run generated at ${new Date().toISOString()}. Human expected labels come from the versioned fixture and are not overwritten by model output.

| Category | Count |
| --- | ---: |
| Agreement | ${agreement.length} |
| Disagreement | ${disagreement.length} |
| Uncertain (no deterministic rule triggered) | ${uncertain.length} |

## Model verdict distribution

| Verdict | Count |
| --- | ---: |
| SEND | ${counts("SEND")} |
| REWRITE | ${counts("REWRITE")} |
| HOLD | ${counts("HOLD")} |
| BLOCK | ${counts("BLOCK")} |

Disagreements and uncertain cases are preserved in \`calibration/live-jev-smoke.latest.json\` for review. No thresholds were tuned by this run.
`;
  await writeFile(reportPath, report, "utf8");
}

describe.skipIf(!liveEnabled)("opt-in live Jev smoke and calibration", () => {
  beforeAll(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCount += 1;
      return originalFetch(input, init);
    }) as typeof fetch;
    provider = new TypeSafeJudgmentProvider();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("runs the seven synthetic smoke cases with one Jev request each", async () => {
    const smoke = [];
    for (const smokeCase of smokeCases) {
      smoke.push(
        await evaluateLiveCase(smokeCase.id, smokeCase.input, smokeCase.description, smokeCase.expectedVerdict),
      );
    }

    expect(smoke).toHaveLength(7);
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

    expect(calibration).toHaveLength(30);
    expect(calibration.every((record) => record.jevRequestCount === 1)).toBe(true);
    await writeLiveArtifacts(smoke, calibration);
  }, 360_000);
});
