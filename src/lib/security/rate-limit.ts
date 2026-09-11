export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
};

type Bucket = { tokens: number; updatedAt: number };

export class MemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now = Date.now()): RateLimitResult {
    const rate = this.limit / this.windowMs;
    const prev = this.buckets.get(key);
    let tokens = this.limit;
    if (prev) {
      const elapsed = Math.max(0, now - prev.updatedAt);
      tokens = Math.min(this.limit, prev.tokens + elapsed * rate);
    }
    if (tokens < 1) {
      const retryAfterSec = Math.max(1, Math.ceil((1 - tokens) / rate / 1000));
      this.buckets.set(key, { tokens, updatedAt: now });
      return { allowed: false, remaining: 0, retryAfterSec, limit: this.limit };
    }
    tokens -= 1;
    this.buckets.set(key, { tokens, updatedAt: now });
    return {
      allowed: true,
      remaining: Math.floor(tokens),
      retryAfterSec: 0,
      limit: this.limit,
    };
  }
}

export function rateLimitBucketForPath(path: string): "auth" | "webhook" | "form" | "api" {
  if (path.startsWith("/api/v1/auth")) return "auth";
  if (path.startsWith("/webhook")) return "webhook";
  if (path.startsWith("/form")) return "form";
  return "api";
}

export const RATE_LIMITS: Record<"auth" | "webhook" | "form" | "api", { limit: number; windowMs: number }> =
  {
    auth: { limit: 20, windowMs: 60_000 },
    webhook: { limit: 60, windowMs: 60_000 },
    form: { limit: 30, windowMs: 60_000 },
    api: { limit: 120, windowMs: 60_000 },
  };
