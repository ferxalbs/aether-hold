import { z } from "zod";

export const HOLD_CONTEXTS = ["social-post", "email", "support-reply"] as const;
export const holdContextSchema = z.enum(HOLD_CONTEXTS);
export type HoldContext = z.infer<typeof holdContextSchema>;

export const holdInputSchema = z
  .object({
    draft: z
      .string()
      .min(1, "Draft is required")
      .max(8_000, "Draft must be 8,000 characters or fewer")
      .refine((value) => value.trim().length > 0, "Draft is required"),
    context: holdContextSchema,
    audience: z.string().max(2_000, "Audience must be 2,000 characters or fewer").optional(),
    intent: z.string().max(2_000, "Intent must be 2,000 characters or fewer").optional(),
    conversationContext: z.string().max(2_000, "Conversation context must be 2,000 characters or fewer").optional(),
  })
  .strict();

export type HoldInput = z.infer<typeof holdInputSchema>;

export const PERCEIVED_INTENTS = ["inform", "ask", "sell", "support", "vent", "attack", "unclear"] as const;
export type PerceivedIntent = (typeof PERCEIVED_INTENTS)[number];

export type ChoiceSignal<T extends string> = {
  kind: "choice";
  choice: T;
  confidence: number;
  probabilities: Record<T, number>;
};

export type ScoreSignal = {
  kind: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  maxScore: number;
};

export type NoulSignal = {
  kind: "noul";
  probability: number;
};

export const SIGNAL_IDS = [
  "perceivedIntent",
  "clarity",
  "recipientValue",
  "tone",
  "secretExposure",
  "hostility",
  "spamRisk",
  "needsVerification",
  "containsCheckableClaim",
  "claimConsequence",
  "addressesRequest",
  "intentAlignment",
] as const;
export type SignalId = (typeof SIGNAL_IDS)[number];

export type SignalDirection = "higher-is-better" | "higher-is-risk" | "categorical";

export type SignalMetadata = {
  id: SignalId;
  label: string;
  direction: SignalDirection;
  informational?: boolean;
};

export const SIGNAL_METADATA: Record<SignalId, SignalMetadata> = {
  perceivedIntent: {
    id: "perceivedIntent",
    label: "Perceived intent",
    direction: "categorical",
    informational: true,
  },
  clarity: { id: "clarity", label: "Clarity", direction: "higher-is-better" },
  recipientValue: { id: "recipientValue", label: "Recipient value", direction: "higher-is-better" },
  tone: { id: "tone", label: "Tone risk", direction: "higher-is-risk" },
  secretExposure: { id: "secretExposure", label: "Secret exposure", direction: "higher-is-risk" },
  hostility: { id: "hostility", label: "Hostility", direction: "higher-is-risk" },
  spamRisk: { id: "spamRisk", label: "Spam risk", direction: "higher-is-risk" },
  needsVerification: { id: "needsVerification", label: "Needs verification", direction: "higher-is-risk" },
  containsCheckableClaim: {
    id: "containsCheckableClaim",
    label: "Checkable claim",
    direction: "higher-is-risk",
  },
  claimConsequence: { id: "claimConsequence", label: "Claim consequence", direction: "higher-is-risk" },
  addressesRequest: { id: "addressesRequest", label: "Addresses request", direction: "higher-is-better" },
  intentAlignment: { id: "intentAlignment", label: "Intent alignment", direction: "higher-is-better" },
};

export type NormalizedSignal = {
  id: SignalId;
  label: string;
  value: number;
  displayValue: string;
  direction: SignalDirection;
  confidence?: number;
  selected?: string;
};

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type JudgmentResult = {
  perceivedIntent: ChoiceSignal<PerceivedIntent>;
  clarity: ScoreSignal;
  recipientValue: ScoreSignal;
  tone: ScoreSignal;
  secretExposure: NoulSignal;
  hostility: NoulSignal;
  spamRisk: NoulSignal;
  needsVerification: NoulSignal;
  containsCheckableClaim: NoulSignal;
  claimConsequence: ScoreSignal;
  addressesRequest?: NoulSignal;
  intentAlignment?: NoulSignal;
  model: string;
  usage?: ProviderUsage;
};

export type Verdict = "SEND" | "REWRITE" | "HOLD" | "BLOCK";

export const REASON_CODES = [
  "secret-exposure",
  "hostility",
  "needs-verification",
  "high-consequence-claim",
  "uncertain-claim",
  "aggressive-tone",
  "spam-risk",
  "low-clarity",
  "low-recipient-value",
  "intent-mismatch",
  "does-not-address-request",
  "missing-signal",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export type ReasonSignalMap = Record<ReasonCode, SignalId | null>;

export const REASON_SIGNAL_MAP: ReasonSignalMap = {
  "secret-exposure": "secretExposure",
  hostility: "hostility",
  "needs-verification": "needsVerification",
  "high-consequence-claim": "claimConsequence",
  "uncertain-claim": "containsCheckableClaim",
  "aggressive-tone": "tone",
  "spam-risk": "spamRisk",
  "low-clarity": "clarity",
  "low-recipient-value": "recipientValue",
  "intent-mismatch": "intentAlignment",
  "does-not-address-request": "addressesRequest",
  "missing-signal": null,
};

export type PolicyDecision = {
  verdict: Verdict;
  reasons: ReasonCode[];
  policyVersion: string;
  signals: NormalizedSignal[];
};

export type EvaluationResponse = {
  verdict: Verdict;
  reasons: ReasonCode[];
  reasonLabels: string[];
  signals: NormalizedSignal[];
  policyVersion: string;
  questionPackVersion: string;
  model: string;
  latencyMs: number;
  estimatedCostUsd: number | null;
  usage: ProviderUsage | null;
  providerMode: "fake" | "typesafe";
  evidenceStatus: EvidenceStatus;
  experimental: true;
};

export type EvaluationErrorCode =
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "EVALUATION_FAILED"
  | "EVIDENCE_FAILED"
  | "provider_not_configured";

export type EvaluationErrorResponse = {
  error: EvaluationErrorCode;
  message: string;
  retryable: boolean;
};

export const EVIDENCE_STATUSES = [
  "NOT_NEEDED",
  "SUPPORTED",
  "DISPUTED",
  "MIXED",
  "INSUFFICIENT",
  "UNAVAILABLE",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export type SelectedClaim = {
  sentenceId: string;
  text: string;
  existenceProbability: number;
  consequenceScore: number;
  selectionConfidence: number;
};

export type EvidenceCandidate = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate?: string;
  originalRank: number;
  relevance?: number;
  supportsClaim?: number;
  contradictsClaim?: number;
  authoritativeSource?: number;
  failure?: string;
};

export type EvidenceReceipt = {
  latencyMs: number;
  estimatedCostUsd: number | null;
  model: string | null;
  requestCount: number;
  provider: string;
};

export type EvidenceResponse = {
  status: EvidenceStatus;
  claim: SelectedClaim | null;
  candidates: EvidenceCandidate[];
  supportCount: number;
  disputeCount: number;
  independentDomainCount: number;
  partialFailure: boolean;
  receipt: EvidenceReceipt;
  policyVersion: string;
};

export const REASON_LABELS: Record<ReasonCode, string> = {
  "secret-exposure": "Possible secret or private information",
  hostility: "Hostile or demeaning language",
  "needs-verification": "A factual claim needs a human check",
  "high-consequence-claim": "A consequential claim needs evidence before sending",
  "uncertain-claim": "The claim signal is uncertain near a consequential threshold",
  "aggressive-tone": "The tone is aggressive and should be softened",
  "spam-risk": "Reads like spam or excessive promotion",
  "low-clarity": "The message is hard to follow",
  "low-recipient-value": "The recipient may not get enough value",
  "intent-mismatch": "The draft does not advance the stated intent",
  "does-not-address-request": "The draft may not answer the request",
  "missing-signal": "A required judgment signal was unavailable",
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
