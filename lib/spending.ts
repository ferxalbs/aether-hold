export type SpendingCategory = "communication" | "evidence";

export class SpendingGuardOpenError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("The provider spending guard is temporarily open.");
    this.name = "SpendingGuardOpenError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type Bucket = { startedAt: number; requests: number; estimatedSpend: number; actualSpend: number };
const buckets = new Map<string, Bucket>();

function positiveEnv(name: string): number | null {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function categoryLimit(category: SpendingCategory, suffix: "HOURLY_SPEND_USD" | "DAILY_SPEND_USD"): number | null {
  const specific = category === "evidence" ? positiveEnv(`HOLD_EVIDENCE_${suffix}`) : null;
  return specific ?? positiveEnv(`HOLD_${suffix}`);
}

function getBucket(key: string, durationMs: number): Bucket {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= durationMs) {
    const next = { startedAt: now, requests: 0, estimatedSpend: 0, actualSpend: 0 };
    buckets.set(key, next);
    return next;
  }
  return current;
}

export function reserveProviderBudget(category: SpendingCategory, estimatedCostUsd?: number): void {
  const minuteLimit = positiveEnv("HOLD_MAX_REQUESTS_PER_MINUTE");
  const hourlyLimit = categoryLimit(category, "HOURLY_SPEND_USD");
  const dailyLimit = categoryLimit(category, "DAILY_SPEND_USD");
  const perRequestEstimate = estimatedCostUsd ?? positiveEnv("HOLD_ESTIMATED_COST_PER_REQUEST_USD") ?? 0;
  const now = Date.now();
  const minute = getBucket(`minute:${category}`, 60_000);
  const hour = getBucket(`hour:${category}`, 3_600_000);
  const day = getBucket(`day:${category}`, 86_400_000);

  if (minuteLimit !== null && minute.requests + 1 > minuteLimit) {
    throw new SpendingGuardOpenError(Math.max(1, Math.ceil((60_000 - (now - minute.startedAt)) / 1000)));
  }
  if (hourlyLimit !== null && hour.estimatedSpend + perRequestEstimate > hourlyLimit) {
    throw new SpendingGuardOpenError(Math.max(1, Math.ceil((3_600_000 - (now - hour.startedAt)) / 1000)));
  }
  if (dailyLimit !== null && day.estimatedSpend + perRequestEstimate > dailyLimit) {
    throw new SpendingGuardOpenError(Math.max(1, Math.ceil((86_400_000 - (now - day.startedAt)) / 1000)));
  }

  minute.requests += 1;
  hour.estimatedSpend += perRequestEstimate;
  day.estimatedSpend += perRequestEstimate;
}

export function recordProviderSpend(category: SpendingCategory, actualCostUsd: number): void {
  if (!Number.isFinite(actualCostUsd) || actualCostUsd <= 0) return;
  getBucket(`hour:${category}`, 3_600_000).actualSpend += actualCostUsd;
  getBucket(`day:${category}`, 86_400_000).actualSpend += actualCostUsd;
}

export function resetSpendingBudgetForTests(): void {
  buckets.clear();
}
