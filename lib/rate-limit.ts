import { createHash } from "node:crypto";

export type RateLimitBucket = "communication" | "evidence" | "rerank";

export type RateLimitResult =
  | { enabled: false; allowed: true; remaining: null; retryAfterSeconds: null }
  | { enabled: true; allowed: boolean; remaining: number; retryAfterSeconds: number };

function configured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim() &&
      process.env.HOLD_RATE_LIMIT_SALT?.trim(),
  );
}
function requestIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "anonymous";
  const salt = process.env.HOLD_RATE_LIMIT_SALT?.trim() as string;
  return createHash("sha256").update(`${salt}:${address}`).digest("hex").slice(0, 24);
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export async function checkRateLimit(
  request: Request,
  bucket: RateLimitBucket = "communication",
  signal?: AbortSignal,
): Promise<RateLimitResult> {
  if (!configured()) return { enabled: false, allowed: true, remaining: null, retryAfterSeconds: null };

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { enabled: false, allowed: true, remaining: null, retryAfterSeconds: null };

  const limit = numberEnv(
    bucket === "communication"
      ? "HOLD_RATE_LIMIT_REQUESTS"
      : bucket === "evidence"
        ? "HOLD_EVIDENCE_RATE_LIMIT_REQUESTS"
        : "HOLD_RERANK_RATE_LIMIT_REQUESTS",
    bucket === "communication" ? 30 : bucket === "evidence" ? 10 : 20,
  );
  const windowSeconds = numberEnv("HOLD_RATE_LIMIT_WINDOW_SECONDS", 60);
  const key = `hold:rate:${bucket}:${requestIdentifier(request)}`;
  const script =
    "local count=redis.call('INCR',KEYS[1]); if count == 1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; local ttl=redis.call('TTL',KEYS[1]); return {count,ttl}";

  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["EVAL", script, "1", key, String(windowSeconds)]]),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Rate limit service unavailable");
  const values = (await response.json()) as Array<{ result?: unknown }>;
  const result = values[0]?.result;
  const tuple = Array.isArray(result) ? result : [];
  const count = Number(tuple[0] ?? 0);
  const ttl = Math.max(1, Number(tuple[1] ?? windowSeconds));
  return {
    enabled: true,
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: ttl,
  };
}
