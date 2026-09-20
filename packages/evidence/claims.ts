import { choice, noul, type Questions, score } from "@typesafe-ai/sdk";
import type { SelectedClaim } from "@/packages/core";
import type { ClaimSelectionPack, ClaimSentence } from "./types";

export const MAX_CLAIM_CANDIDATES = 8;
export const CLAIM_EXISTENCE_THRESHOLD = 0.65;

function validProbabilityMap(value: unknown, requiredKeys: readonly string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (
    entries.length !== requiredKeys.length ||
    requiredKeys.some((key) => !Object.hasOwn(value, key)) ||
    entries.some(
      ([, probability]) =>
        typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1,
    )
  ) {
    return false;
  }
  const total = entries.reduce((sum, [, probability]) => sum + Number(probability), 0);
  return Math.abs(total - 1) <= 0.05;
}

export function assertChoiceResponse(answer: unknown, allowedChoices: readonly string[]): void {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
    throw new Error("Malformed evidence choice answer");
  }
  const value = answer as { type?: unknown; choice?: unknown; confidence?: unknown; probabilities?: unknown };
  if (
    value.type !== "choice" ||
    typeof value.choice !== "string" ||
    !allowedChoices.includes(value.choice) ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !validProbabilityMap(value.probabilities, allowedChoices)
  ) {
    throw new Error("Malformed evidence choice answer");
  }
}

export function assertScoreResponse(answer: unknown, maxScore: number): void {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
    throw new Error("Malformed evidence score answer");
  }
  const value = answer as { type?: unknown; score?: unknown; confidence?: unknown; probabilities?: unknown };
  const scoreKeys = Array.from({ length: maxScore + 1 }, (_, score) => String(score));
  if (
    value.type !== "score" ||
    typeof value.score !== "number" ||
    !Number.isFinite(value.score) ||
    value.score < 0 ||
    value.score > maxScore ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !validProbabilityMap(value.probabilities, scoreKeys)
  ) {
    throw new Error("Malformed evidence score answer");
  }
}

function sentenceParts(draft: string): string[] {
  return draft
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function splitClaimCandidates(draft: string, maxCandidates = MAX_CLAIM_CANDIDATES): ClaimSentence[] {
  return sentenceParts(draft)
    .slice(0, Math.max(1, maxCandidates))
    .map((text, index) => ({ sentenceId: `sentence-${index + 1}`, text }));
}

export function createClaimSelectionPack(draft: string, maxCandidates = MAX_CLAIM_CANDIDATES): ClaimSelectionPack {
  return { sentences: splitClaimCandidates(draft, maxCandidates), maxCandidates };
}

export function buildClaimSelectionQuestions(pack: ClaimSelectionPack): Questions {
  const sentenceIds = Object.fromEntries(pack.sentences.map(({ sentenceId }) => [sentenceId, null]));
  return {
    claimExists: noul(
      "Does the state contain at least one sentence that makes an externally checkable factual assertion? Ignore opinions, preferences, greetings, questions, emotions, and hypothetical wording.",
      {
        true: "At least one listed sentence asserts a fact about a person, event, number, cause, current state, research result, or other externally checkable matter.",
        false: "No listed sentence makes an externally checkable factual assertion.",
      },
    ),
    selectedClaim: choice(
      "Which sentence ID is the single most consequential externally checkable factual assertion? Choice always returns an option; return the least-wrong sentence only when a factual assertion exists.",
      sentenceIds,
    ),
    consequence: score(
      "How consequential would publishing the most consequential factual assertion in the state be if it were wrong? Use the highest applicable level; use the lowest level when no factual assertion exists.",
      [
        "No checkable assertion or an inconsequential statement where an error would not affect a person's decision, safety, money, rights, or reputation.",
        "A checkable statement where an error could cause limited confusion or a minor decision problem, but little material harm.",
        "A checkable statement where an error could materially affect a team's, customer's, or audience's decision, money, access, or reputation.",
        "A checkable statement where an error could materially affect safety, health, legal rights, security, finances, or a large audience's behavior.",
      ],
    ),
  };
}

export function selectClaimFromAnswers(
  pack: ClaimSelectionPack,
  answers: Record<string, unknown>,
  existenceThreshold = CLAIM_EXISTENCE_THRESHOLD,
): SelectedClaim | null {
  const exists = answers.claimExists as { type?: unknown; noul?: unknown } | undefined;
  const selected = answers.selectedClaim as { type?: unknown; choice?: unknown; confidence?: unknown } | undefined;
  const consequence = answers.consequence as { type?: unknown; score?: unknown } | undefined;
  if (
    exists?.type !== "noul" ||
    typeof exists.noul !== "number" ||
    !Number.isFinite(exists.noul) ||
    exists.noul < 0 ||
    exists.noul > 1 ||
    selected?.type !== "choice" ||
    typeof selected.choice !== "string" ||
    typeof selected.confidence !== "number" ||
    !Number.isFinite(selected.confidence) ||
    selected.confidence < 0 ||
    selected.confidence > 1 ||
    !consequence ||
    consequence.type !== "score" ||
    typeof consequence.score !== "number" ||
    !Number.isFinite(consequence.score) ||
    consequence.score < 0 ||
    consequence.score > 3
  ) {
    throw new Error("Malformed claim selection answer");
  }

  if (exists.noul < existenceThreshold) return null;
  const sentence = pack.sentences.find((candidate) => candidate.sentenceId === selected.choice);
  if (!sentence) throw new Error("Claim selection returned an unknown sentence ID");
  return {
    sentenceId: sentence.sentenceId,
    text: sentence.text,
    existenceProbability: exists.noul,
    consequenceScore: consequence.score,
    selectionConfidence: selected.confidence,
  };
}

export function buildQueryCandidates(claim: SelectedClaim): string[] {
  const normalized = claim.text.replace(/\s+/g, " ").trim();
  const candidates = [normalized, `fact check ${normalized}`, `evidence for ${normalized}`];
  return [...new Set(candidates)].filter((query) => query.length > 0).slice(0, 3);
}

export function buildQuerySelectionQuestions(queries: string[]): Questions {
  return {
    selectedQuery: choice(
      "Which bounded query candidate is the best search query for the selected claim? Select an existing candidate only; do not generate or rewrite text.",
      Object.fromEntries(queries.map((query, index) => [`query-${index + 1}`, query])),
    ),
  };
}

export function selectQueryFromAnswers(queries: string[], answers: Record<string, unknown>): string {
  const selected = answers.selectedQuery as { type?: unknown; choice?: unknown; confidence?: unknown } | undefined;
  if (
    selected?.type !== "choice" ||
    typeof selected.choice !== "string" ||
    typeof selected.confidence !== "number" ||
    !Number.isFinite(selected.confidence) ||
    selected.confidence < 0 ||
    selected.confidence > 1
  ) {
    throw new Error("Malformed evidence query selection answer");
  }
  const match = /^query-(\d+)$/.exec(selected.choice);
  const index = match ? Number(match[1]) - 1 : -1;
  if (!Number.isInteger(index) || index < 0 || index >= queries.length || !queries[index]) {
    throw new Error("Evidence query selection returned an unknown candidate");
  }
  return queries[index];
}
