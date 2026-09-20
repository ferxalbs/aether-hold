import { estimateCostUsd } from "@/lib/pricing";
import type { EvidenceCandidate, EvidenceResponse, HoldInput } from "@/packages/core";
import { buildQueryCandidates, createClaimSelectionPack } from "./claims";
import { EVIDENCE_POLICY_VERSION, evaluateEvidenceStatus } from "./policy";
import { EVIDENCE_TIMEOUT_MS, MAX_EVIDENCE_RESULTS } from "./providers";
import type { EvidenceDependencies } from "./types";

export const EVIDENCE_OVERALL_TIMEOUT_MS = 20_000;

export class EvidenceTimeoutError extends Error {
  constructor() {
    super("Evidence search timed out");
    this.name = "EvidenceTimeoutError";
  }
}

export function createNotNeededEvidenceResponse(provider = "not-requested"): EvidenceResponse {
  return {
    status: "NOT_NEEDED",
    claim: null,
    candidates: [],
    supportCount: 0,
    disputeCount: 0,
    independentDomainCount: 0,
    partialFailure: false,
    receipt: {
      latencyMs: 1,
      estimatedCostUsd: 0,
      model: null,
      requestCount: 0,
      provider,
    },
    policyVersion: EVIDENCE_POLICY_VERSION,
  };
}

function mergeSignals(parent: AbortSignal | undefined, controller: AbortController): (() => void) | undefined {
  if (!parent) return undefined;
  if (parent.aborted) controller.abort(parent.reason);
  const onAbort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", onAbort, { once: true });
  return () => parent.removeEventListener("abort", onAbort);
}

async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cleanup = mergeSignals(parent, controller);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new EvidenceTimeoutError();
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([task(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    cleanup?.();
  }
}

function deduplicateCandidates(candidates: EvidenceCandidate[]): EvidenceCandidate[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const output: EvidenceCandidate[] = [];
  for (const candidate of candidates) {
    const title = candidate.title.toLowerCase().replace(/\W+/g, " ").trim();
    if (seenUrls.has(candidate.url) || seenTitles.has(title)) continue;
    seenUrls.add(candidate.url);
    seenTitles.add(title);
    // Preserve the search provider's rank. The policy uses it only as the
    // final tie-breaker after semantic and independent-domain signals.
    output.push({ ...candidate });
    if (output.length >= MAX_EVIDENCE_RESULTS) break;
  }
  return output;
}

export function dedupeEvidenceCandidates(candidates: EvidenceCandidate[]): EvidenceCandidate[] {
  return deduplicateCandidates(candidates);
}

export async function evaluateEvidence(
  input: HoldInput,
  dependencies: EvidenceDependencies,
  options: { verifyRequested?: boolean; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<EvidenceResponse> {
  const started = performance.now();
  if (!options.verifyRequested) {
    return createNotNeededEvidenceResponse(dependencies.searchProvider.name);
  }
  const pack = createClaimSelectionPack(input.draft);
  if (pack.sentences.length === 0) {
    return createNotNeededEvidenceResponse(dependencies.searchProvider.name);
  }

  const result = await withTimeout(
    async (signal) => {
      const claimSelection = await dependencies.claimProvider.selectClaim(input, pack, signal);
      const claim = claimSelection.claim;
      if (!claim) {
        return {
          status: "NOT_NEEDED" as const,
          claim: null,
          candidates: [],
          supportCount: 0,
          disputeCount: 0,
          independentDomainCount: 0,
          partialFailure: false,
          requestCount: claimSelection.requestCount,
          model: claimSelection.model,
          inputTokens: claimSelection.inputTokens ?? 0,
          outputTokens: claimSelection.outputTokens ?? 0,
        };
      }
      const queries = buildQueryCandidates(claim);
      const originalQuery = queries[0];
      const originalSearch = withTimeout(
        (providerSignal) =>
          dependencies.searchProvider.search({
            query: originalQuery,
            limit: MAX_EVIDENCE_RESULTS,
            signal: providerSignal,
          }),
        EVIDENCE_TIMEOUT_MS,
        signal,
      );
      // Query selection can abort before the lane join; keep the speculative
      // request observed so a provider rejection cannot become unhandled.
      void originalSearch.catch(() => undefined);
      let querySelectionRequestCount = 0;
      let querySelectionInputTokens = 0;
      let querySelectionOutputTokens = 0;
      let querySelectionModel: string | null = null;
      let selectedQuery = queries[0];
      let querySelectionPartialFailure = false;
      try {
        const querySelection = await dependencies.queryProvider.selectQuery(claim, queries, signal);
        if (!queries.includes(querySelection.query)) throw new Error("Query provider returned an unknown candidate");
        selectedQuery = querySelection.query;
        querySelectionRequestCount = querySelection.requestCount;
        querySelectionInputTokens = querySelection.inputTokens ?? 0;
        querySelectionOutputTokens = querySelection.outputTokens ?? 0;
        querySelectionModel = querySelection.model;
      } catch (error) {
        if (signal.aborted) throw error;
        querySelectionPartialFailure = true;
      }
      const selectedQueries = [
        ...new Set([queries[0], selectedQuery].filter((query): query is string => Boolean(query))),
      ];
      const lanes = await Promise.allSettled([
        originalSearch,
        ...selectedQueries
          .filter((query) => query !== originalQuery)
          .map((query) =>
            withTimeout(
              (providerSignal) =>
                dependencies.searchProvider.search({ query, limit: MAX_EVIDENCE_RESULTS, signal: providerSignal }),
              EVIDENCE_TIMEOUT_MS,
              signal,
            ),
          ),
      ]);
      const successful = lanes.filter(
        (lane): lane is PromiseFulfilledResult<EvidenceCandidate[]> => lane.status === "fulfilled",
      );
      const rawCandidates = successful.flatMap((lane) => lane.value);
      const searchPartialFailure = querySelectionPartialFailure || successful.length !== lanes.length;
      const candidates = deduplicateCandidates(rawCandidates);
      if (successful.length === 0) {
        return {
          status: "UNAVAILABLE" as const,
          claim,
          candidates: [],
          supportCount: 0,
          disputeCount: 0,
          independentDomainCount: 0,
          partialFailure: true,
          requestCount: claimSelection.requestCount + querySelectionRequestCount,
          model: querySelectionModel || claimSelection.model,
          inputTokens: (claimSelection.inputTokens ?? 0) + querySelectionInputTokens,
          outputTokens: (claimSelection.outputTokens ?? 0) + querySelectionOutputTokens,
        };
      }
      if (candidates.length === 0) {
        return {
          status: "INSUFFICIENT" as const,
          claim,
          candidates: [],
          supportCount: 0,
          disputeCount: 0,
          independentDomainCount: 0,
          partialFailure: searchPartialFailure,
          requestCount: claimSelection.requestCount + querySelectionRequestCount,
          model: querySelectionModel || claimSelection.model,
          inputTokens: (claimSelection.inputTokens ?? 0) + querySelectionInputTokens,
          outputTokens: (claimSelection.outputTokens ?? 0) + querySelectionOutputTokens,
        };
      }
      let reranked: Awaited<ReturnType<EvidenceDependencies["rerankProvider"]["rerank"]>>;
      try {
        reranked = await dependencies.rerankProvider.rerank(claim, candidates, signal);
      } catch {
        return {
          status: "UNAVAILABLE" as const,
          claim,
          candidates,
          supportCount: 0,
          disputeCount: 0,
          independentDomainCount: 0,
          partialFailure: true,
          requestCount: claimSelection.requestCount + querySelectionRequestCount,
          model: querySelectionModel || claimSelection.model,
          inputTokens: (claimSelection.inputTokens ?? 0) + querySelectionInputTokens,
          outputTokens: (claimSelection.outputTokens ?? 0) + querySelectionOutputTokens,
        };
      }
      const status = evaluateEvidenceStatus(reranked.candidates);
      return {
        status: status.status,
        claim,
        candidates: status.rankedCandidates,
        supportCount: status.supportCount,
        disputeCount: status.disputeCount,
        independentDomainCount: status.independentDomainCount,
        partialFailure: searchPartialFailure,
        requestCount: claimSelection.requestCount + querySelectionRequestCount + reranked.requestCount,
        model: reranked.model,
        inputTokens: (claimSelection.inputTokens ?? 0) + querySelectionInputTokens + (reranked.inputTokens ?? 0),
        outputTokens: (claimSelection.outputTokens ?? 0) + querySelectionOutputTokens + (reranked.outputTokens ?? 0),
      };
    },
    options.timeoutMs ?? EVIDENCE_OVERALL_TIMEOUT_MS,
    options.signal,
  );

  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  return {
    status: result.status,
    claim: result.claim,
    candidates: result.candidates,
    supportCount: result.supportCount,
    disputeCount: result.disputeCount,
    independentDomainCount: result.independentDomainCount,
    partialFailure: result.partialFailure,
    receipt: {
      latencyMs,
      estimatedCostUsd: estimateCostUsd(
        { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        "typesafe",
      ),
      model: result.model,
      requestCount: result.requestCount,
      provider: dependencies.searchProvider.name,
    },
    policyVersion: EVIDENCE_POLICY_VERSION,
  };
}

export * from "./claims";
export * from "./fake";
export * from "./policy";
export * from "./providers";
export * from "./types";
