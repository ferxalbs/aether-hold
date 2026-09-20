import { describe, expect, it } from "vitest";
import { isEvidenceEnabled } from "@/lib/provider-config";
import type { HoldInput } from "@/packages/core";
import {
  ConfiguredEvidenceSearchProvider,
  evaluateEvidence,
  TypeSafeClaimSelectionProvider,
  TypeSafeEvidenceRerankProvider,
  TypeSafeQuerySelectionProvider,
} from "@/packages/evidence";

const liveEnabled =
  process.env.RUN_LIVE_EVIDENCE === "1" &&
  Boolean(process.env.TYPESAFE_API_KEY?.trim()) &&
  [undefined, "", "typesafe"].includes(process.env.HOLD_PROVIDER?.trim().toLowerCase()) &&
  isEvidenceEnabled() &&
  Boolean(process.env.EVIDENCE_SEARCH_URL?.trim()) &&
  Boolean(process.env.EVIDENCE_SEARCH_API_KEY?.trim());

describe.skipIf(!liveEnabled)("opt-in live Evidence smoke", () => {
  it("selects one claim and query, retrieves inspectable HTTPS sources, and reranks in one batched request", async () => {
    const input: HoldInput = {
      draft: "A public randomized study reports that this intervention improves recovery by 20%.",
      context: "email",
      intent: "Share a claim that should be checked before publication",
    };
    const result = await evaluateEvidence(
      input,
      {
        searchProvider: new ConfiguredEvidenceSearchProvider(),
        claimProvider: new TypeSafeClaimSelectionProvider(),
        queryProvider: new TypeSafeQuerySelectionProvider(),
        rerankProvider: new TypeSafeEvidenceRerankProvider(),
      },
      { verifyRequested: true },
    );

    expect(result.claim).not.toBeNull();
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => /^https:\/\//.test(candidate.url))).toBe(true);
    expect(result.receipt.requestCount).toBe(3);
    expect(["SUPPORTED", "DISPUTED", "MIXED", "INSUFFICIENT", "UNAVAILABLE"]).toContain(result.status);
  }, 60_000);
});
