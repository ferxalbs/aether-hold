import { createHash } from "node:crypto";

type RateLimitResult =
  | { enabled: false; allowed: true; remaining: null }
  | { enabled: true; allowed: boolean; remaining: number };

function configured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function requestIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "anonymous";
  const salt = process.env.HOLD_RATE_LIMIT_SALT || "hold-local-rate-limit";
  return createHash("sha256").update(`${salt}:${address}`).digest("hex").slice(0, 24);
}

export async function checkRateLimit(request: Request): Promise<RateLimitResult> {
  if (!configured()) return { enabled: false, allowed: true, remaining: null };

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { enabled: false, allowed: true, remaining: null };

  const limit = Math.max(1, Number(process.env.HOLD_RATE_LIMIT_REQUESTS || 30));
  const windowSeconds = Math.max(1, Number(process.env.HOLD_RATE_LIMIT_WINDOW_SECONDS || 60));
  const key = `hold:rate:${requestIdentifier(request)}`;

  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, windowSeconds],
    ]),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Rate limit service unavailable");
  const values = (await response.json()) as Array<{ result?: number }>;
  const count = Number(values[0]?.result ?? 0);
  return { enabled: true, allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
