import type { EvidenceCandidate, HoldInput, SelectedClaim } from "@/packages/core";
import { buildQueryCandidates } from "./claims";
import type {
  ClaimSelectionPack,
  ClaimSelectionProvider,
  EvidenceRerankProvider,
  EvidenceSearchInput,
  EvidenceSearchProvider,
  QuerySelectionProvider,
} from "./types";

export class FakeEvidenceSearchProvider implements EvidenceSearchProvider {
  readonly name = "fake-search";

  async search(input: EvidenceSearchInput): Promise<EvidenceCandidate[]> {
    return [
      {
        id: "fake-source-1",
        title: `Evidence for ${input.query.slice(0, 80)}`,
        url: "https://example.com/evidence/fake-source-1",
        snippet: "Development simulation: this source is only a fixture and does not establish factual truth.",
        source: "example.com",
        originalRank: 1,
      },
    ];
  }
}

export class FakeClaimSelectionProvider implements ClaimSelectionProvider {
  async selectClaim(input: HoldInput, pack: ClaimSelectionPack) {
    const claim = pack.sentences.find((sentence) =>
      /\b(according to|study|research|data|will|always|never|today|yesterday|percent|%|guaranteed|breaking)\b/i.test(
        sentence.text,
      ),
    );
    if (!claim) return { claim: null, model: "fake-jev-local", requestCount: 0, inputTokens: 0, outputTokens: 0 };
    return {
      claim: {
        sentenceId: claim.sentenceId,
        text: claim.text,
        existenceProbability: 0.92,
        consequenceScore: /health|safety|legal|security|financial|money/i.test(input.draft) ? 3 : 2,
        selectionConfidence: 0.86,
      },
      model: "fake-jev-local",
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export class FakeQuerySelectionProvider implements QuerySelectionProvider {
  async selectQuery(_claim: SelectedClaim, queries: string[]) {
    return {
      query: queries[0] || "",
      model: "fake-jev-local",
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export class FakeEvidenceRerankProvider implements EvidenceRerankProvider {
  async rerank(_claim: SelectedClaim, candidates: EvidenceCandidate[]) {
    return {
      candidates: candidates.map((candidate) => ({
        ...candidate,
        relevance: 0.8,
        supportsClaim: 0.5,
        contradictsClaim: 0.1,
        authoritativeSource: 0.2,
      })),
      model: "fake-jev-local",
      requestCount: 1,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export function fakeEvidenceQueries(claim: SelectedClaim): string[] {
  return buildQueryCandidates(claim);
}
