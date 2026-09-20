import { describe, expect, it } from "vitest";
import { estimateCostUsd, TYPESAFE_PRICING } from "@/lib/pricing";

describe("provider pricing and usage receipts", () => {
  it("prices only input tokens for TypeSafe and keeps fake mode visibly free", () => {
    expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 999_999 }, "typesafe")).toBe(
      TYPESAFE_PRICING.inputUsdPerMillionTokens,
    );
    expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 999_999 }, "fake")).toBe(0);
    expect(estimateCostUsd(undefined, "typesafe")).toBeNull();
  });
});
