import type { HoldInput, JudgmentResult, NormalizedSignal, PolicyDecision, ReasonCode } from "@/packages/core";
import { clamp01 } from "@/packages/core";
import { POLICY_THRESHOLDS, POLICY_VERSION } from "./config";

const likelySecretPattern =
  /(sk-[a-z0-9_-]{12,}|(?:gh[pousr]|xox[baprs])_[a-z0-9_-]{16,}|api[_ -]?key\s*[:=]|access[_ -]?token\s*[:=]|private key|password\s*[:=]|-----begin [a-z0-9 ]*private key-----)/i;

function scoreValue(score: number, maxScore: number): number {
  return clamp01(maxScore > 0 ? score / maxScore : 0);
}

function signal(
  id: string,
  label: string,
  value: number,
  displayValue: string,
  confidence?: number,
  selected?: string,
): NormalizedSignal {
  return {
    id,
    label,
    value: clamp01(value),
    displayValue,
    ...(confidence === undefined ? {} : { confidence: clamp01(confidence) }),
    ...(selected === undefined ? {} : { selected }),
  };
}

export function normalizeSignals(result: JudgmentResult): NormalizedSignal[] {
  const signals: NormalizedSignal[] = [
    signal(
      "recommendedAction",
      "Recommended action",
      result.recommendedAction.confidence,
      result.recommendedAction.choice,
      result.recommendedAction.confidence,
      result.recommendedAction.choice,
    ),
    signal(
      "perceivedIntent",
      "Perceived intent",
      result.perceivedIntent.confidence,
      result.perceivedIntent.choice,
      result.perceivedIntent.confidence,
      result.perceivedIntent.choice,
    ),
    signal(
      "clarity",
      "Clarity",
      scoreValue(result.clarity.score, result.clarity.maxScore),
      `${Math.round(scoreValue(result.clarity.score, result.clarity.maxScore) * 100)}%`,
      result.clarity.confidence,
    ),
    signal(
      "recipientValue",
      "Recipient value",
      scoreValue(result.recipientValue.score, result.recipientValue.maxScore),
      `${Math.round(scoreValue(result.recipientValue.score, result.recipientValue.maxScore) * 100)}%`,
      result.recipientValue.confidence,
    ),
    signal(
      "tone",
      "Tone",
      scoreValue(result.tone.score, result.tone.maxScore),
      `${Math.round(scoreValue(result.tone.score, result.tone.maxScore) * 100)}%`,
      result.tone.confidence,
    ),
    signal(
      "secretExposure",
      "Secret exposure",
      result.secretExposure.probability,
      `${Math.round(clamp01(result.secretExposure.probability) * 100)}% likely`,
    ),
    signal(
      "hostility",
      "Hostility",
      result.hostility.probability,
      `${Math.round(clamp01(result.hostility.probability) * 100)}% likely`,
    ),
    signal(
      "spamRisk",
      "Spam risk",
      result.spamRisk.probability,
      `${Math.round(clamp01(result.spamRisk.probability) * 100)}% likely`,
    ),
    signal(
      "needsVerification",
      "Needs verification",
      result.needsVerification.probability,
      `${Math.round(clamp01(result.needsVerification.probability) * 100)}% likely`,
    ),
  ];

  if (result.addressesRequest) {
    signals.push(
      signal(
        "addressesRequest",
        "Addresses request",
        result.addressesRequest.probability,
        `${Math.round(clamp01(result.addressesRequest.probability) * 100)}% likely`,
      ),
    );
  }

  if (result.intentAlignment) {
    signals.push(
      signal(
        "intentAlignment",
        "Intent alignment",
        result.intentAlignment.probability,
        `${Math.round(clamp01(result.intentAlignment.probability) * 100)}% likely`,
      ),
    );
  }

  return signals;
}

function pushReason(reasons: ReasonCode[], reason: ReasonCode): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function evaluatePolicy(input: HoldInput, result: JudgmentResult): PolicyDecision {
  const reasons: ReasonCode[] = [];
  const clarityNormalized = scoreValue(result.clarity.score, result.clarity.maxScore);
  const recipientValueNormalized = scoreValue(result.recipientValue.score, result.recipientValue.maxScore);

  let verdict: PolicyDecision["verdict"] = "SEND";

  if (
    likelySecretPattern.test(input.draft) ||
    result.secretExposure.probability >= POLICY_THRESHOLDS.secretExposureBlock
  ) {
    verdict = "BLOCK";
    pushReason(reasons, "secret-exposure");
  }
  if (result.hostility.probability >= POLICY_THRESHOLDS.hostilityBlock) {
    verdict = "BLOCK";
    pushReason(reasons, "hostility");
  }

  if (verdict !== "BLOCK" && result.needsVerification.probability >= POLICY_THRESHOLDS.needsVerificationHold) {
    verdict = "HOLD";
    pushReason(reasons, "needs-verification");
  }
  if (verdict !== "BLOCK" && result.recommendedAction.confidence < POLICY_THRESHOLDS.recommendedActionConfidenceHold) {
    verdict = "HOLD";
    pushReason(reasons, "low-action-confidence");
  }

  if (verdict !== "BLOCK" && verdict !== "HOLD" && result.spamRisk.probability >= POLICY_THRESHOLDS.spamRiskRewrite) {
    verdict = "REWRITE";
    pushReason(reasons, "spam-risk");
  }
  if (verdict !== "BLOCK" && verdict !== "HOLD" && clarityNormalized < POLICY_THRESHOLDS.clarityRewrite) {
    verdict = "REWRITE";
    pushReason(reasons, "low-clarity");
  }
  if (verdict !== "BLOCK" && verdict !== "HOLD" && recipientValueNormalized < POLICY_THRESHOLDS.recipientValueRewrite) {
    verdict = "REWRITE";
    pushReason(reasons, "low-recipient-value");
  }
  if (
    input.intent &&
    result.intentAlignment &&
    verdict !== "BLOCK" &&
    verdict !== "HOLD" &&
    result.intentAlignment.probability < POLICY_THRESHOLDS.intentAlignmentRewrite
  ) {
    verdict = "REWRITE";
    pushReason(reasons, "intent-mismatch");
  }
  if (
    input.conversationContext &&
    result.addressesRequest &&
    verdict !== "BLOCK" &&
    verdict !== "HOLD" &&
    result.addressesRequest.probability < POLICY_THRESHOLDS.addressesRequestRewrite
  ) {
    verdict = "REWRITE";
    pushReason(reasons, "does-not-address-request");
  }

  return {
    verdict,
    reasons,
    policyVersion: POLICY_VERSION,
    signals: normalizeSignals(result),
  };
}

export { POLICY_THRESHOLDS, POLICY_VERSION } from "./config";
