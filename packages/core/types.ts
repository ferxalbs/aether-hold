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

export const ACTIONS = ["send", "rewrite", "hold", "block"] as const;
export type RecommendedAction = (typeof ACTIONS)[number];

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

export type NormalizedSignal = {
  id: string;
  label: string;
  value: number;
  displayValue: string;
  confidence?: number;
  selected?: string;
};

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type JudgmentResult = {
  recommendedAction: ChoiceSignal<RecommendedAction>;
  perceivedIntent: ChoiceSignal<PerceivedIntent>;
  clarity: ScoreSignal;
  recipientValue: ScoreSignal;
  tone: ScoreSignal;
  secretExposure: NoulSignal;
  hostility: NoulSignal;
  spamRisk: NoulSignal;
  needsVerification: NoulSignal;
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
  "low-action-confidence",
  "spam-risk",
  "low-clarity",
  "low-recipient-value",
  "intent-mismatch",
  "does-not-address-request",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

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
  experimental: true;
};

export type EvaluationErrorCode = "INVALID_INPUT" | "RATE_LIMITED" | "TIMEOUT" | "EVALUATION_FAILED";

export type EvaluationErrorResponse = {
  error: EvaluationErrorCode;
  message: string;
  retryable: boolean;
};

export const REASON_LABELS: Record<ReasonCode, string> = {
  "secret-exposure": "Possible secret or private information",
  hostility: "Hostile or demeaning language",
  "needs-verification": "A factual claim needs a human check",
  "low-action-confidence": "Jev is not confident enough to auto-send",
  "spam-risk": "Reads like spam or excessive promotion",
  "low-clarity": "The message is hard to follow",
  "low-recipient-value": "The recipient may not get enough value",
  "intent-mismatch": "The draft does not advance the stated intent",
  "does-not-address-request": "The draft may not answer the request",
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
