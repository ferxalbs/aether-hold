import type { EvidenceCandidate, EvidenceResponse, HoldInput, SelectedClaim } from "@/packages/core";

export type EvidenceSearchInput = {
  query: string;
  limit: number;
  signal?: AbortSignal;
};

export interface EvidenceSearchProvider {
  readonly name: string;
  search(input: EvidenceSearchInput): Promise<EvidenceCandidate[]>;
}

export type ClaimSentence = {
  sentenceId: string;
  text: string;
};

export type ClaimSelectionPack = {
  sentences: ClaimSentence[];
  maxCandidates: number;
};

export type ClaimSelectionResult = {
  claim: SelectedClaim | null;
  model: string;
  requestCount: number;
  inputTokens?: number;
  outputTokens?: number;
};

export interface ClaimSelectionProvider {
  selectClaim(input: HoldInput, pack: ClaimSelectionPack, signal?: AbortSignal): Promise<ClaimSelectionResult>;
}

export type EvidenceQuerySelection = {
  query: string;
  model: string;
  requestCount: number;
  inputTokens?: number;
  outputTokens?: number;
};

export interface QuerySelectionProvider {
  selectQuery(claim: SelectedClaim, queries: string[], signal?: AbortSignal): Promise<EvidenceQuerySelection>;
}

export type EvidenceRerankState = {
  claim: string;
  candidate: Pick<EvidenceCandidate, "title" | "snippet" | "source" | "publishedDate">;
};

export interface EvidenceRerankProvider {
  rerank(
    claim: SelectedClaim,
    candidates: EvidenceCandidate[],
    signal?: AbortSignal,
  ): Promise<{
    candidates: EvidenceCandidate[];
    model: string;
    requestCount: number;
    inputTokens?: number;
    outputTokens?: number;
  }>;
}

export type EvidenceDependencies = {
  searchProvider: EvidenceSearchProvider;
  claimProvider: ClaimSelectionProvider;
  queryProvider: QuerySelectionProvider;
  rerankProvider: EvidenceRerankProvider;
};

export type EvidenceEvaluationResult = EvidenceResponse & {
  input: Pick<HoldInput, "context">;
};
