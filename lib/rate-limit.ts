type Bucket = number[];

const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 5;
const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function checkRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const cutoff = now - WINDOW_MS;
  const filtered = (buckets.get(key) ?? []).filter((ts) => ts > cutoff);
  if (filtered.length >= MAX_REQUESTS) {
    const oldest = filtered[0] ?? now;
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + WINDOW_MS - now),
    };
  }
  filtered.push(now);
  buckets.set(key, filtered);
  return {
    ok: true,
    remaining: MAX_REQUESTS - filtered.length,
    retryAfterMs: 0,
  };
}

export function resetRateLimit(key?: string): void {
  if (key) buckets.delete(key);
  else buckets.clear();
}
