import type {
  HoldInput,
  JudgmentResult,
  NormalizedSignal,
  PolicyDecision,
  ReasonCode,
  SignalId,
} from "@/packages/core";
import { clamp01, REASON_SIGNAL_MAP, SIGNAL_METADATA } from "@/packages/core";
import { POLICY_THRESHOLDS, POLICY_VERSION } from "./config";

const likelySecretPattern =
  /(sk-[a-z0-9_-]{12,}|(?:gh[pousr]|xox[baprs])_[a-z0-9_-]{16,}|api[_ -]?key\s*[:=]|access[_ -]?token\s*[:=]|private key|password\s*[:=]|-----begin [a-z0-9 ]*private key-----|\b(?:send|share|paste|provide|post|enter|give)\b[\s\S]{0,80}\b(?:password|access token|api key|secret|token)\b)/i;

function scoreValue(score: number, maxScore: number): number {
  return clamp01(maxScore > 0 ? score / maxScore : 0);
}

function signal(
  id: SignalId,
  value: number,
  displayValue: string,
  confidence?: number,
  selected?: string,
): NormalizedSignal {
  const metadata = SIGNAL_METADATA[id];
  return {
    id,
    label: metadata.label,
    value: clamp01(value),
    displayValue,
    direction: metadata.direction,
    ...(confidence === undefined ? {} : { confidence: clamp01(confidence) }),
    ...(selected === undefined ? {} : { selected }),
  };
}

export function normalizeSignals(result: JudgmentResult): NormalizedSignal[] {
  const signals: NormalizedSignal[] = [
    signal(
      "perceivedIntent",
      result.perceivedIntent.confidence,
      result.perceivedIntent.choice,
      result.perceivedIntent.confidence,
      result.perceivedIntent.choice,
    ),
    signal(
      "clarity",
      scoreValue(result.clarity.score, result.clarity.maxScore),
      `${Math.round(scoreValue(result.clarity.score, result.clarity.maxScore) * 100)}%`,
      result.clarity.confidence,
    ),
    signal(
      "recipientValue",
      scoreValue(result.recipientValue.score, result.recipientValue.maxScore),
      `${Math.round(scoreValue(result.recipientValue.score, result.recipientValue.maxScore) * 100)}%`,
      result.recipientValue.confidence,
    ),
    signal(
      "tone",
      scoreValue(result.tone.score, result.tone.maxScore),
      result.tone.score >= 2 ? "Aggressive or abusive" : result.tone.score >= 1 ? "Tense" : "Calm",
      result.tone.confidence,
    ),
    signal(
      "secretExposure",
      result.secretExposure.probability,
      `${Math.round(clamp01(result.secretExposure.probability) * 100)}% likely`,
    ),
    signal(
      "hostility",
      result.hostility.probability,
      `${Math.round(clamp01(result.hostility.probability) * 100)}% likely`,
    ),
    signal(
      "spamRisk",
      result.spamRisk.probability,
      `${Math.round(clamp01(result.spamRisk.probability) * 100)}% likely`,
    ),
    signal(
      "needsVerification",
      result.needsVerification.probability,
      `${Math.round(clamp01(result.needsVerification.probability) * 100)}% likely`,
    ),
    signal(
      "containsCheckableClaim",
      result.containsCheckableClaim.probability,
      `${Math.round(clamp01(result.containsCheckableClaim.probability) * 100)}% likely`,
    ),
    signal(
      "claimConsequence",
      scoreValue(result.claimConsequence.score, result.claimConsequence.maxScore),
      `${Math.round(scoreValue(result.claimConsequence.score, result.claimConsequence.maxScore) * 100)}% consequence`,
      result.claimConsequence.confidence,
    ),
  ];

  if (result.addressesRequest) {
    signals.push(
      signal(
        "addressesRequest",
        result.addressesRequest.probability,
        `${Math.round(clamp01(result.addressesRequest.probability) * 100)}% likely`,
      ),
    );
  }

  if (result.intentAlignment) {
    signals.push(
      signal(
        "intentAlignment",
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

function setVerdict(current: PolicyDecision["verdict"], next: PolicyDecision["verdict"]): PolicyDecision["verdict"] {
  const priority = { SEND: 0, REWRITE: 1, HOLD: 2, BLOCK: 3 } as const;
  return priority[next] > priority[current] ? next : current;
}

export function signalForReason(reason: ReasonCode): SignalId | null {
  return REASON_SIGNAL_MAP[reason];
}

export function evaluatePolicy(input: HoldInput, result: JudgmentResult): PolicyDecision {
  const reasons: ReasonCode[] = [];
  const clarityNormalized = scoreValue(result.clarity.score, result.clarity.maxScore);
  const recipientValueNormalized = scoreValue(result.recipientValue.score, result.recipientValue.maxScore);
  const toneNormalized = scoreValue(result.tone.score, result.tone.maxScore);
  const consequenceNormalized = scoreValue(result.claimConsequence.score, result.claimConsequence.maxScore);
  const checkableClaim = result.containsCheckableClaim.probability;

  let verdict: PolicyDecision["verdict"] = "SEND";

  if (
    likelySecretPattern.test(input.draft) ||
    result.secretExposure.probability >= POLICY_THRESHOLDS.secretExposureBlock
  ) {
    verdict = setVerdict(verdict, "BLOCK");
    pushReason(reasons, "secret-exposure");
  }
  if (result.hostility.probability >= POLICY_THRESHOLDS.hostilityBlock) {
    verdict = setVerdict(verdict, "BLOCK");
    pushReason(reasons, "hostility");
  }

  const missingConditionalSignal =
    (Boolean(input.intent) && !result.intentAlignment) ||
    (Boolean(input.conversationContext) && !result.addressesRequest);
  if (missingConditionalSignal) {
    verdict = setVerdict(verdict, "HOLD");
    pushReason(reasons, "missing-signal");
  }

  const needsVerificationHold = result.needsVerification.probability >= POLICY_THRESHOLDS.needsVerificationHold;
  const highConsequenceClaim =
    checkableClaim >= POLICY_THRESHOLDS.containsCheckableClaim &&
    consequenceNormalized >= POLICY_THRESHOLDS.highConsequenceClaim;
  const uncertainConsequentialClaim =
    checkableClaim >= POLICY_THRESHOLDS.uncertainClaimFloor &&
    checkableClaim < POLICY_THRESHOLDS.containsCheckableClaim &&
    consequenceNormalized >= POLICY_THRESHOLDS.highConsequenceClaim;

  if (needsVerificationHold) {
    verdict = setVerdict(verdict, "HOLD");
    pushReason(reasons, "needs-verification");
  }
  if (highConsequenceClaim) {
    verdict = setVerdict(verdict, "HOLD");
    pushReason(reasons, "high-consequence-claim");
  }
  if (uncertainConsequentialClaim) {
    verdict = setVerdict(verdict, "HOLD");
    pushReason(reasons, "uncertain-claim");
  }

  if (
    toneNormalized >= POLICY_THRESHOLDS.toneRewrite &&
    result.hostility.probability < POLICY_THRESHOLDS.hostilityBlock
  ) {
    verdict = setVerdict(verdict, "REWRITE");
    pushReason(reasons, "aggressive-tone");
  }
  if (result.spamRisk.probability >= POLICY_THRESHOLDS.spamRiskRewrite) {
    verdict = setVerdict(verdict, "REWRITE");
    pushReason(reasons, "spam-risk");
  }
  if (clarityNormalized < POLICY_THRESHOLDS.clarityRewrite) {
    verdict = setVerdict(verdict, "REWRITE");
    pushReason(reasons, "low-clarity");
  }
  if (recipientValueNormalized < POLICY_THRESHOLDS.recipientValueRewrite) {
    verdict = setVerdict(verdict, "REWRITE");
    pushReason(reasons, "low-recipient-value");
  }
  if (
    input.intent &&
    result.intentAlignment &&
    result.intentAlignment.probability < POLICY_THRESHOLDS.intentAlignmentRewrite
  ) {
    verdict = setVerdict(verdict, "REWRITE");
    pushReason(reasons, "intent-mismatch");
  }
  if (
    input.conversationContext &&
    result.addressesRequest &&
    result.addressesRequest.probability < POLICY_THRESHOLDS.addressesRequestRewrite
  ) {
    verdict = setVerdict(verdict, "REWRITE");
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
