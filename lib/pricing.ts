import type { ProviderUsage } from "@/packages/core";

/**
 * TypeSafe's documented Jev price is input-only: $42 per billion tokens
 * ($0.042 per million tokens). Output tokens are free.
 * Source: https://docs.typesafe.ai/models.md
 */
export const TYPESAFE_PRICING = {
  inputUsdPerMillionTokens: 0.042,
  outputUsdPerMillionTokens: 0,
  source: "https://docs.typesafe.ai/models.md",
} as const;

export function estimateCostUsd(usage: ProviderUsage | undefined, providerMode: "fake" | "typesafe"): number | null {
  if (!usage) return null;
  if (providerMode === "fake") return 0;
  return Number(((usage.inputTokens / 1_000_000) * TYPESAFE_PRICING.inputUsdPerMillionTokens).toFixed(6));
}
