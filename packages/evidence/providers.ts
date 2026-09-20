import { createHash } from "node:crypto";
import { noul, type Questions, TypeSafeClient } from "@typesafe-ai/sdk";
import { z } from "zod";
import { ProviderNotConfiguredError, resolveProviderConfig } from "@/lib/provider-config";
import type { EvidenceCandidate, HoldInput, SelectedClaim } from "@/packages/core";
import {
  assertChoiceResponse,
  assertScoreResponse,
  buildClaimSelectionQuestions,
  buildQuerySelectionQuestions,
  selectClaimFromAnswers,
  selectQueryFromAnswers,
} from "./claims";
import type {
  ClaimSelectionPack,
  ClaimSelectionProvider,
  ClaimSelectionResult,
  EvidenceRerankProvider,
  EvidenceSearchInput,
  EvidenceSearchProvider,
  QuerySelectionProvider,
} from "./types";

export const EVIDENCE_TIMEOUT_MS = 8_000;
export const MAX_EVIDENCE_RESULTS = 12;

export class EvidenceProviderNotConfiguredError extends Error {
  constructor(message = "Evidence search is not configured.") {
    super(message);
    this.name = "EvidenceProviderNotConfiguredError";
  }
}

const candidateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  url: z.string().url(),
  snippet: z.string().max(4_000).default(""),
  source: z.string().trim().min(1).max(200).optional(),
  publishedDate: z.string().max(100).optional(),
  rank: z.number().finite().int().positive().optional(),
});

function canonicalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeEvidenceUrl(value: string): string | null {
  return canonicalUrl(value);
}

function hostFor(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function stableId(url: string, title: string): string {
  return createHash("sha256").update(`${url}\n${title.toLowerCase()}`).digest("hex").slice(0, 16);
}

function parseCandidate(raw: unknown, fallbackRank: number): EvidenceCandidate | null {
  const parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const url = normalizeEvidenceUrl(parsed.data.url);
  if (!url) return null;
  return {
    id: stableId(url, parsed.data.title),
    title: parsed.data.title,
    url,
    snippet: parsed.data.snippet,
    source: parsed.data.source || hostFor(url),
    ...(parsed.data.publishedDate ? { publishedDate: parsed.data.publishedDate } : {}),
    originalRank: parsed.data.rank ?? fallbackRank,
  };
}

export function validateEvidenceCandidates(raw: unknown, limit = MAX_EVIDENCE_RESULTS): EvidenceCandidate[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { results?: unknown }).results)
      ? (raw as { results: unknown[] }).results
      : raw && typeof raw === "object" && Array.isArray((raw as { organic_results?: unknown }).organic_results)
        ? (raw as { organic_results: unknown[] }).organic_results
        : [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const result: EvidenceCandidate[] = [];
  for (const [index, item] of list.entries()) {
    const candidate = parseCandidate(item, index + 1);
    if (!candidate) continue;
    const titleKey = candidate.title.toLowerCase().replace(/\W+/g, " ").trim();
    if (seenUrls.has(candidate.url) || seenTitles.has(titleKey)) continue;
    seenUrls.add(candidate.url);
    seenTitles.add(titleKey);
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}

export class ConfiguredEvidenceSearchProvider implements EvidenceSearchProvider {
  readonly name = "configured-search";
  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(environment: Record<string, string | undefined> = process.env) {
    const endpoint = environment.EVIDENCE_SEARCH_URL?.trim();
    const apiKey = environment.EVIDENCE_SEARCH_API_KEY?.trim();
    if (!endpoint || !apiKey)
      throw new EvidenceProviderNotConfiguredError(
        "Set EVIDENCE_SEARCH_URL and EVIDENCE_SEARCH_API_KEY to enable Evidence.",
      );
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    } catch {
      throw new EvidenceProviderNotConfiguredError("EVIDENCE_SEARCH_URL must be an HTTP(S) endpoint.");
    }
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async search(input: EvidenceSearchInput): Promise<EvidenceCandidate[]> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ q: input.query, limit: Math.min(MAX_EVIDENCE_RESULTS, Math.max(1, input.limit)) }),
      signal: input.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Evidence provider returned ${response.status}`);
    const payload = await response.json();
    return validateEvidenceCandidates(payload);
  }
}

function asNoul(answer: unknown): number {
  if (
    !answer ||
    typeof answer !== "object" ||
    (answer as { type?: unknown }).type !== "noul" ||
    typeof (answer as { noul?: unknown }).noul !== "number" ||
    !Number.isFinite((answer as { noul: number }).noul) ||
    (answer as { noul: number }).noul < 0 ||
    (answer as { noul: number }).noul > 1
  ) {
    throw new Error("Malformed evidence noul answer");
  }
  return (answer as { noul: number }).noul;
}

function asAnswerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed evidence answers");
  }
  return value as Record<string, unknown>;
}

export class TypeSafeClaimSelectionProvider implements ClaimSelectionProvider {
  private readonly client: TypeSafeClient;

  constructor() {
    const config = resolveProviderConfig();
    if (config.mode !== "typesafe" || !config.hasApiKey) throw new ProviderNotConfiguredError();
    this.client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      defaultModel: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
      timeout: EVIDENCE_TIMEOUT_MS,
      logLevel: "off",
      retry: { maxRetries: 0 },
    });
  }

  async selectClaim(input: HoldInput, pack: ClaimSelectionPack, signal?: AbortSignal): Promise<ClaimSelectionResult> {
    const response = await this.client.systemOne(
      {
        model: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
        state: { draft: input.draft, context: input.context, sentences: pack.sentences },
        questions: buildClaimSelectionQuestions(pack),
      },
      { signal, timeout: EVIDENCE_TIMEOUT_MS, retry: { maxRetries: 0 } },
    );
    const answers = asAnswerRecord(response.answers);
    assertChoiceResponse(
      answers.selectedClaim,
      pack.sentences.map((sentence) => sentence.sentenceId),
    );
    assertScoreResponse(answers.consequence, 3);
    return {
      claim: selectClaimFromAnswers(pack, answers),
      model: response.model,
      requestCount: 1,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

export class TypeSafeQuerySelectionProvider implements QuerySelectionProvider {
  private readonly client: TypeSafeClient;

  constructor() {
    const config = resolveProviderConfig();
    if (config.mode !== "typesafe" || !config.hasApiKey) throw new ProviderNotConfiguredError();
    this.client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      defaultModel: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
      timeout: EVIDENCE_TIMEOUT_MS,
      logLevel: "off",
      retry: { maxRetries: 0 },
    });
  }

  async selectQuery(claim: SelectedClaim, queries: string[], signal?: AbortSignal) {
    const response = await this.client.systemOne(
      {
        model: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
        state: {
          claim: claim.text,
          queryCandidates: queries.map((query, index) => ({ id: `query-${index + 1}`, query })),
        },
        questions: buildQuerySelectionQuestions(queries),
      },
      { signal, timeout: EVIDENCE_TIMEOUT_MS, retry: { maxRetries: 0 } },
    );
    const answers = asAnswerRecord(response.answers);
    assertChoiceResponse(
      answers.selectedQuery,
      queries.map((_, index) => `query-${index + 1}`),
    );
    return {
      query: selectQueryFromAnswers(queries, answers),
      model: response.model,
      requestCount: 1,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

export class TypeSafeEvidenceRerankProvider implements EvidenceRerankProvider {
  private readonly client: TypeSafeClient;

  constructor() {
    const config = resolveProviderConfig();
    if (config.mode !== "typesafe" || !config.hasApiKey) throw new ProviderNotConfiguredError();
    this.client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      defaultModel: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
      timeout: EVIDENCE_TIMEOUT_MS,
      logLevel: "off",
      retry: { maxRetries: 0 },
    });
  }

  async rerank(claim: SelectedClaim, candidates: EvidenceCandidate[], signal?: AbortSignal) {
    const bounded = candidates.slice(0, MAX_EVIDENCE_RESULTS);
    const questions: Questions = {};
    for (const [index] of bounded.entries()) {
      const suffix = index + 1;
      questions[`relevant_${suffix}`] = noul("Does this candidate directly address the selected claim?", {
        true: "The title or snippet is materially about the exact claim, not merely a neighboring topic.",
        false: "The title or snippet is irrelevant, too general, or only loosely related.",
      });
      questions[`supports_${suffix}`] = noul("Does this candidate support the selected claim?", {
        true: "The candidate presents evidence consistent with the claim.",
        false: "The candidate does not support the claim or provides no direction.",
      });
      questions[`contradicts_${suffix}`] = noul("Does this candidate materially contradict the selected claim?", {
        true: "The candidate presents evidence inconsistent with the claim.",
        false: "The candidate does not materially contradict the claim.",
      });
      questions[`authoritative_${suffix}`] = noul("Is this candidate an authoritative source for the selected claim?", {
        true: "The source is a primary, official, scholarly, regulatory, or otherwise expert source for this claim.",
        false: "The source is an unverified opinion, aggregation, anonymous post, or otherwise weak authority.",
      });
    }
    const response = await this.client.systemOne(
      {
        model: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
        state: {
          claim: claim.text,
          candidates: bounded.map(({ title, snippet, source, publishedDate }) => ({
            title,
            snippet,
            source,
            publishedDate: publishedDate ?? null,
          })),
        },
        questions,
      },
      { signal, timeout: EVIDENCE_TIMEOUT_MS, retry: { maxRetries: 0 } },
    );
    const answers = asAnswerRecord(response.answers);
    const ranked = bounded.map((candidate, index) => {
      const suffix = index + 1;
      return {
        ...candidate,
        relevance: asNoul(answers[`relevant_${suffix}`]),
        supportsClaim: asNoul(answers[`supports_${suffix}`]),
        contradictsClaim: asNoul(answers[`contradicts_${suffix}`]),
        authoritativeSource: asNoul(answers[`authoritative_${suffix}`]),
      };
    });
    return {
      candidates: ranked,
      model: response.model,
      requestCount: 1,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
