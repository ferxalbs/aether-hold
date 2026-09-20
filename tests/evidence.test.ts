import { describe, expect, it } from "vitest";
import { POST as evidenceRoute } from "@/app/api/evidence/route";
import type { EvidenceCandidate, HoldInput } from "@/packages/core";
import {
  assertChoiceResponse,
  assertScoreResponse,
  buildClaimSelectionQuestions,
  buildQueryCandidates,
  buildQuerySelectionQuestions,
  ConfiguredEvidenceSearchProvider,
  createClaimSelectionPack,
  dedupeEvidenceCandidates,
  EvidenceTimeoutError,
  evaluateEvidence,
  evaluateEvidenceStatus,
  FakeClaimSelectionProvider,
  FakeEvidenceRerankProvider,
  FakeQuerySelectionProvider,
  integrateEvidenceVerdict,
  normalizeEvidenceUrl,
  rankEvidenceCandidates,
  selectClaimFromAnswers,
  selectQueryFromAnswers,
  TypeSafeEvidenceRerankProvider,
  TypeSafeQuerySelectionProvider,
} from "@/packages/evidence";

const input: HoldInput = {
  draft: "Research says the change saves 40% of time.",
  context: "email",
};

function candidate(overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  return {
    id: "candidate",
    title: "Independent research",
    url: "https://example.com/report",
    snippet: "A report about the measured change.",
    source: "example.com",
    originalRank: 1,
    relevance: 0.9,
    supportsClaim: 0.9,
    contradictsClaim: 0.05,
    authoritativeSource: 0.9,
    ...overrides,
  };
}

describe("Evidence claim and retrieval primitives", () => {
  it("bounds sentence candidates and uses the three atomic claim questions", () => {
    const pack = createClaimSelectionPack("First fact. Second fact? Third fact! Fourth fact.", 3);
    expect(pack.sentences).toEqual([
      { sentenceId: "sentence-1", text: "First fact." },
      { sentenceId: "sentence-2", text: "Second fact?" },
      { sentenceId: "sentence-3", text: "Third fact!" },
    ]);
    expect(Object.keys(buildClaimSelectionQuestions(pack))).toEqual(["claimExists", "selectedClaim", "consequence"]);
  });

  it("preserves the selected sentence text while assigning stable IDs", () => {
    expect(createClaimSelectionPack("First  fact.\nSecond\tfact?", 2).sentences).toEqual([
      { sentenceId: "sentence-1", text: "First  fact." },
      { sentenceId: "sentence-2", text: "Second\tfact?" },
    ]);
  });

  it("gates a Choice result with claim existence", () => {
    const pack = createClaimSelectionPack("Research says this works.");
    expect(() =>
      buildQueryCandidates({
        sentenceId: "sentence-1",
        text: "Research says this works.",
        existenceProbability: 0.9,
        consequenceScore: 2,
        selectionConfidence: 0.8,
      }),
    ).not.toThrow();
    expect(
      selectClaimFromAnswers(pack, {
        claimExists: { type: "noul", noul: 0.2 },
        selectedClaim: { type: "choice", choice: "sentence-1", confidence: 1 },
        consequence: { type: "score", score: 2 },
      }),
    ).toBeNull();
  });

  it("uses Choice only to select an existing query candidate", () => {
    const queries = ["the original claim", "fact check the original claim"];
    expect(Object.keys(buildQuerySelectionQuestions(queries))).toEqual(["selectedQuery"]);
    expect(
      selectQueryFromAnswers(queries, { selectedQuery: { type: "choice", choice: "query-2", confidence: 0.9 } }),
    ).toBe("fact check the original claim");
    expect(() =>
      selectQueryFromAnswers(queries, { selectedQuery: { type: "choice", choice: "new prose", confidence: 0.9 } }),
    ).toThrow("unknown candidate");
  });

  it("rejects out-of-range atomic claim-selection answers", () => {
    const pack = createClaimSelectionPack("Research says this works.");
    expect(() =>
      selectClaimFromAnswers(pack, {
        claimExists: { type: "noul", noul: 1.2 },
        selectedClaim: { type: "choice", choice: "sentence-1", confidence: 0.9 },
        consequence: { type: "score", score: 2 },
      }),
    ).toThrow("Malformed claim selection answer");
  });

  it("rejects malformed Evidence Choice and Score probability maps", () => {
    expect(() =>
      assertChoiceResponse({ type: "choice", choice: "query-1", confidence: 0.9, probabilities: { "query-1": 0.9 } }, [
        "query-1",
        "query-2",
      ]),
    ).toThrow("Malformed evidence choice answer");
    expect(() =>
      assertScoreResponse(
        { type: "score", score: 2, confidence: 0.9, probabilities: { "0": 0.1, "1": 0.1, "2": 0.8 } },
        3,
      ),
    ).toThrow("Malformed evidence score answer");
  });

  it("rejects unsafe URLs and deduplicates canonical URLs and titles", () => {
    expect(normalizeEvidenceUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeEvidenceUrl("https://EXAMPLE.com/report/#fragment")).toBe("https://example.com/report");
    expect(
      dedupeEvidenceCandidates([
        candidate(),
        candidate({ id: "duplicate", url: "https://example.com/report/", originalRank: 7 }),
        candidate({ id: "same-title", url: "https://other.example/report", originalRank: 9 }),
      ]),
    ).toHaveLength(1);
    expect(
      dedupeEvidenceCandidates([candidate({ id: "rank-7", url: "https://example.com/rank-7", originalRank: 7 })])[0]
        ?.originalRank,
    ).toBe(7);
  });

  it("requires an HTTP(S) search adapter endpoint", () => {
    expect(
      () =>
        new ConfiguredEvidenceSearchProvider({
          EVIDENCE_SEARCH_URL: "javascript:alert(1)",
          EVIDENCE_SEARCH_API_KEY: "synthetic",
        }),
    ).toThrow(/HTTP\(S\)/);
  });

  it("sends a bounded provider-neutral search request and validates its response", async () => {
    const originalFetch = globalThis.fetch;
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      request = { url: input.toString(), init };
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "A source",
              url: "https://EXAMPLE.com/source/#section",
              snippet: "A bounded result.",
              source: "example.com",
              rank: 1,
            },
            { title: "Unsafe", url: "javascript:alert(1)", snippet: "drop" },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const provider = new ConfiguredEvidenceSearchProvider({
        EVIDENCE_SEARCH_URL: "https://search.example/api",
        EVIDENCE_SEARCH_API_KEY: "synthetic",
      });
      const candidates = await provider.search({ query: "a claim", limit: 99 });
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.url).toBe("https://example.com/source");
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(request?.url).toBe("https://search.example/api");
    expect(request?.init?.headers).toMatchObject({ Authorization: "Bearer synthetic" });
    expect(JSON.parse(String(request?.init?.body))).toEqual({ q: "a claim", limit: 12 });
  });

  it("prioritizes independent support and contradiction without treating duplicate domains as independent", () => {
    const result = evaluateEvidenceStatus([
      candidate(),
      candidate({ id: "second", url: "https://example.com/other", originalRank: 2 }),
      candidate({ id: "third", url: "https://research.org/report", source: "research.org", originalRank: 3 }),
      candidate({
        id: "contradict",
        url: "https://regulator.gov/report",
        source: "regulator.gov",
        supportsClaim: 0.05,
        contradictsClaim: 0.95,
        authoritativeSource: 0.95,
        originalRank: 4,
      }),
    ]);
    expect(result.status).toBe("MIXED");
    expect(result.independentDomainCount).toBe(3);
  });

  it("uses independent-domain agreement as the final evidence ranking signal before original rank", () => {
    const ranked = rankEvidenceCandidates([
      candidate({
        id: "lone-dispute",
        url: "https://lone.example/report",
        source: "lone.example",
        originalRank: 1,
        relevance: 0.9,
        authoritativeSource: 0.8,
        supportsClaim: 0.1,
        contradictsClaim: 0.8,
      }),
      candidate({
        id: "agreed-support-a",
        url: "https://a.example/report",
        source: "a.example",
        originalRank: 2,
        relevance: 0.9,
        authoritativeSource: 0.8,
        supportsClaim: 0.8,
        contradictsClaim: 0.1,
      }),
      candidate({
        id: "agreed-support-b",
        url: "https://b.example/report",
        source: "b.example",
        originalRank: 3,
        relevance: 0.9,
        authoritativeSource: 0.8,
        supportsClaim: 0.8,
        contradictsClaim: 0.1,
      }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["agreed-support-a", "agreed-support-b", "lone-dispute"]);
  });

  it("never lets disputed or insufficient evidence leave a SEND verdict unchanged", () => {
    expect(integrateEvidenceVerdict("SEND", "DISPUTED")).toBe("HOLD");
    expect(integrateEvidenceVerdict("SEND", "MIXED")).toBe("HOLD");
    expect(integrateEvidenceVerdict("SEND", "INSUFFICIENT")).toBe("HOLD");
    expect(integrateEvidenceVerdict("BLOCK", "SUPPORTED")).toBe("BLOCK");
  });

  it("runs the selected query and one batched rerank request", async () => {
    const searches: string[] = [];
    const result = await evaluateEvidence(
      input,
      {
        claimProvider: new FakeClaimSelectionProvider(),
        queryProvider: new FakeQuerySelectionProvider(),
        rerankProvider: new FakeEvidenceRerankProvider(),
        searchProvider: {
          name: "test-search",
          search: async ({ query }) => {
            searches.push(query);
            return [
              candidate({
                id: query,
                url: `https://source.example/${encodeURIComponent(query)}`,
                source: "source.example",
              }),
            ];
          },
        },
      },
      { verifyRequested: true },
    );
    expect(result.claim?.sentenceId).toBe("sentence-1");
    expect(searches.length).toBe(1);
    expect(result.receipt.requestCount).toBe(1);
    expect(result.status).toBe("INSUFFICIENT");
  });

  it("starts the original-claim search before selecting an alternative query", async () => {
    let originalSearchStarted = false;
    const result = await evaluateEvidence(
      input,
      {
        claimProvider: new FakeClaimSelectionProvider(),
        queryProvider: {
          selectQuery: async (_claim, queries) => {
            expect(originalSearchStarted).toBe(true);
            return {
              query: queries[1] ?? queries[0] ?? "",
              model: "test-jev",
              requestCount: 1,
              inputTokens: 10,
              outputTokens: 5,
            };
          },
        },
        rerankProvider: new FakeEvidenceRerankProvider(),
        searchProvider: {
          name: "speculative-search",
          search: async ({ query }) => {
            if (query === input.draft) originalSearchStarted = true;
            return [];
          },
        },
      },
      { verifyRequested: true },
    );
    expect(result.status).toBe("INSUFFICIENT");
  });

  it("batches typed reranking questions without sending search-query state", async () => {
    const originalFetch = globalThis.fetch;
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      HOLD_PROVIDER: process.env.HOLD_PROVIDER,
      TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    };
    let calls = 0;
    let body: Record<string, unknown> | undefined;
    const environment = process.env as Record<string, string | undefined>;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const questionKeys = Object.keys((body.questions as Record<string, unknown>) || {});
      const answers = questionKeys.includes("selectedQuery")
        ? {
            selectedQuery: {
              type: "choice",
              choice: "query-2",
              confidence: 0.9,
              probabilities: { "query-1": 0.05, "query-2": 0.95 },
            },
          }
        : {
            relevant_1: { type: "noul", noul: 0.9 },
            supports_1: { type: "noul", noul: 0.8 },
            contradicts_1: { type: "noul", noul: 0.1 },
            authoritative_1: { type: "noul", noul: 0.7 },
          };
      return new Response(
        JSON.stringify({
          model: "jev-evidence-test",
          answers,
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    environment.NODE_ENV = "test";
    delete environment.VERCEL_ENV;
    environment.HOLD_PROVIDER = "typesafe";
    environment.TYPESAFE_API_KEY = "ts-synthetic-test-key";
    try {
      const queryProvider = new TypeSafeQuerySelectionProvider();
      const queryResponse = await queryProvider.selectQuery(
        {
          sentenceId: "sentence-1",
          text: "Research says this works.",
          existenceProbability: 0.9,
          consequenceScore: 2,
          selectionConfidence: 0.8,
        },
        ["Research says this works.", "fact check Research says this works."],
      );
      expect(calls).toBe(1);
      expect(queryResponse.query).toBe("fact check Research says this works.");
      expect(body?.state).toEqual({
        claim: "Research says this works.",
        queryCandidates: [
          { id: "query-1", query: "Research says this works." },
          { id: "query-2", query: "fact check Research says this works." },
        ],
      });
      expect(body?.questions && Object.keys(body.questions as object)).toEqual(["selectedQuery"]);

      const provider = new TypeSafeEvidenceRerankProvider();
      const response = await provider.rerank(
        {
          sentenceId: "sentence-1",
          text: "Research says this works.",
          existenceProbability: 0.9,
          consequenceScore: 2,
          selectionConfidence: 0.8,
        },
        [candidate()],
      );
      expect(calls).toBe(2);
      expect(response.requestCount).toBe(1);
      expect(response.candidates[0]).toMatchObject({ relevance: 0.9, supportsClaim: 0.8 });
      expect(body?.state).toEqual({
        claim: "Research says this works.",
        candidates: [
          {
            title: "Independent research",
            snippet: "A report about the measured change.",
            source: "example.com",
            publishedDate: null,
          },
        ],
      });
      expect(body?.questions && Object.keys(body.questions as object)).toEqual([
        "relevant_1",
        "supports_1",
        "contradicts_1",
        "authoritative_1",
      ]);
      expect(JSON.stringify(body)).not.toContain("fact check");
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete environment[key];
        else environment[key] = value;
      }
    }
  });

  it("rejects out-of-range or incorrectly typed rerank Noul answers", async () => {
    const originalFetch = globalThis.fetch;
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      HOLD_PROVIDER: process.env.HOLD_PROVIDER,
      TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    };
    const environment = process.env as Record<string, string | undefined>;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          model: "jev-evidence-test",
          answers: { relevant_1: { type: "noul", noul: 1.2 } },
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
        { status: 200 },
      )) as typeof fetch;
    environment.NODE_ENV = "test";
    delete environment.VERCEL_ENV;
    environment.HOLD_PROVIDER = "typesafe";
    environment.TYPESAFE_API_KEY = "ts-synthetic-test-key";
    try {
      const provider = new TypeSafeEvidenceRerankProvider();
      await expect(
        provider.rerank(
          {
            sentenceId: "sentence-1",
            text: "Research says this works.",
            existenceProbability: 0.9,
            consequenceScore: 2,
            selectionConfidence: 0.8,
          },
          [candidate()],
        ),
      ).rejects.toThrow("Malformed evidence noul answer");
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete environment[key];
        else environment[key] = value;
      }
    }
  });

  it("does not search when the caller has not explicitly requested verification", async () => {
    let searched = false;
    const result = await evaluateEvidence(input, {
      claimProvider: new FakeClaimSelectionProvider(),
      queryProvider: new FakeQuerySelectionProvider(),
      rerankProvider: new FakeEvidenceRerankProvider(),
      searchProvider: {
        name: "test-search",
        search: async () => {
          searched = true;
          return [];
        },
      },
    });
    expect(result.status).toBe("NOT_NEEDED");
    expect(result.receipt.requestCount).toBe(0);
    expect(searched).toBe(false);
  });

  it("does not search when claim selection finds no checkable claim", async () => {
    let searched = false;
    const result = await evaluateEvidence(
      { draft: "A greeting with no factual assertion.", context: "email" },
      {
        claimProvider: {
          selectClaim: async () => ({
            claim: null,
            model: "test-jev",
            requestCount: 1,
            inputTokens: 10,
            outputTokens: 5,
          }),
        },
        queryProvider: new FakeQuerySelectionProvider(),
        rerankProvider: new FakeEvidenceRerankProvider(),
        searchProvider: {
          name: "test-search",
          search: async () => {
            searched = true;
            return [];
          },
        },
      },
      { verifyRequested: true },
    );
    expect(result.status).toBe("NOT_NEEDED");
    expect(result.receipt.requestCount).toBe(1);
    expect(searched).toBe(false);
  });

  it("returns a no-op response without requiring Evidence configuration", async () => {
    const response = await evidenceRoute(
      new Request("http://localhost/api/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: input.draft, context: input.context }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "NOT_NEEDED",
      claim: null,
      receipt: { requestCount: 0, provider: "not-requested" },
    });
  });

  it("distinguishes an empty successful search from a provider outage", async () => {
    const emptyResult = await evaluateEvidence(
      input,
      {
        claimProvider: new FakeClaimSelectionProvider(),
        queryProvider: new FakeQuerySelectionProvider(),
        rerankProvider: new FakeEvidenceRerankProvider(),
        searchProvider: {
          name: "empty-search",
          search: async () => [],
        },
      },
      { verifyRequested: true },
    );
    expect(emptyResult.status).toBe("INSUFFICIENT");
    expect(emptyResult.partialFailure).toBe(false);

    const unavailableResult = await evaluateEvidence(
      input,
      {
        claimProvider: new FakeClaimSelectionProvider(),
        queryProvider: new FakeQuerySelectionProvider(),
        rerankProvider: new FakeEvidenceRerankProvider(),
        searchProvider: {
          name: "outage-search",
          search: async () => {
            throw new Error("synthetic search outage");
          },
        },
      },
      { verifyRequested: true },
    );
    expect(unavailableResult.status).toBe("UNAVAILABLE");
    expect(unavailableResult.partialFailure).toBe(true);
  });

  it("aborts a hanging evidence provider at the overall timeout", async () => {
    let observedSignal: AbortSignal | undefined;
    await expect(
      evaluateEvidence(
        input,
        {
          claimProvider: new FakeClaimSelectionProvider(),
          queryProvider: new FakeQuerySelectionProvider(),
          rerankProvider: new FakeEvidenceRerankProvider(),
          searchProvider: {
            name: "hanging-search",
            search: async ({ signal }) => {
              observedSignal = signal;
              return new Promise<EvidenceCandidate[]>(() => undefined);
            },
          },
        },
        { verifyRequested: true, timeoutMs: 5 },
      ),
    ).rejects.toBeInstanceOf(EvidenceTimeoutError);
    expect(observedSignal?.aborted).toBe(true);
  });

  it("returns an explicit unavailable status when reranking fails after search", async () => {
    const result = await evaluateEvidence(
      input,
      {
        claimProvider: new FakeClaimSelectionProvider(),
        queryProvider: new FakeQuerySelectionProvider(),
        rerankProvider: {
          rerank: async () => {
            throw new Error("synthetic rerank outage");
          },
        },
        searchProvider: {
          name: "test-search",
          search: async () => [candidate()],
        },
      },
      { verifyRequested: true },
    );
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.partialFailure).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });
});
