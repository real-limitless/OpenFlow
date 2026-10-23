export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
};

export type RateBucket = "auth" | "webhook" | "form" | "api";

/** Fixed-window counter. Atomic when run via EVAL. */
export const FIXED_WINDOW_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

export type RedisEval = (script: string, numKeys: number, ...args: string[]) => Promise<unknown>;

let redisEvalOverride: RedisEval | null = null;
let redisClient: { eval: RedisEval } | null = null;

/** Tests inject a fake EVAL so the limiter does not open a socket. */
export function setRedisEvalForTests(fn: RedisEval | null): void {
  redisEvalOverride = fn;
}

export function fixedWindowFromCount(count: number, limit: number, ttlMs: number): RateLimitResult {
  const retryAfterSec = Math.max(1, Math.ceil(Math.max(0, ttlMs) / 1000));
  if (count > limit) {
    return { allowed: false, remaining: 0, retryAfterSec, limit };
  }
  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    retryAfterSec: 0,
    limit,
  };
}

function parseCountTtl(raw: unknown): { count: number; ttlMs: number } {
  const arr = Array.isArray(raw) ? raw : [];
  const count = Number(arr[0] ?? 0);
  const ttlMs = Number(arr[1] ?? 0);
  return {
    count: Number.isFinite(count) ? count : 0,
    ttlMs: Number.isFinite(ttlMs) ? ttlMs : 0,
  };
}

async function defaultRedisEval(
  script: string,
  numKeys: number,
  ...args: string[]
): Promise<unknown> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error("REDIS_URL is unset");
  if (!redisClient) {
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 500,
    });
    redisClient = {
      eval: (s, n, ...a) => client.eval(s, n, ...a) as Promise<unknown>,
    };
  }
  return redisClient.eval(script, numKeys, ...args);
}

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

export function rateLimitBucketForPath(path: string): RateBucket {
  if (path.startsWith("/api/v1/auth")) return "auth";
  if (path.startsWith("/webhook")) return "webhook";
  if (path.startsWith("/form")) return "form";
  return "api";
}

export const RATE_LIMITS: Record<RateBucket, { limit: number; windowMs: number }> = {
  auth: { limit: 20, windowMs: 60_000 },
  webhook: { limit: 60, windowMs: 60_000 },
  form: { limit: 30, windowMs: 60_000 },
  api: { limit: 120, windowMs: 60_000 },
};

const memoryLimiters: Record<RateBucket, MemoryRateLimiter> = {
  auth: new MemoryRateLimiter(RATE_LIMITS.auth.limit, RATE_LIMITS.auth.windowMs),
  webhook: new MemoryRateLimiter(RATE_LIMITS.webhook.limit, RATE_LIMITS.webhook.windowMs),
  form: new MemoryRateLimiter(RATE_LIMITS.form.limit, RATE_LIMITS.form.windowMs),
  api: new MemoryRateLimiter(RATE_LIMITS.api.limit, RATE_LIMITS.api.windowMs),
};

/**
 * Redis fixed-window counters when REDIS_URL is set (or a test EVAL is installed).
 * Any Redis error falls back to the in-memory limiter.
 */
export async function takeRateLimit(bucket: RateBucket, key: string): Promise<RateLimitResult> {
  const spec = RATE_LIMITS[bucket];
  const useRedis = Boolean(process.env.REDIS_URL?.trim() || redisEvalOverride);
  if (useRedis) {
    try {
      const evalFn = redisEvalOverride ?? defaultRedisEval;
      const raw = await evalFn(FIXED_WINDOW_LUA, 1, `rl:${key}`, String(spec.windowMs));
      const { count, ttlMs } = parseCountTtl(raw);
      return fixedWindowFromCount(count, spec.limit, ttlMs);
    } catch {
      /* Redis down: keep serving with the process-local window. */
    }
  }
  return memoryLimiters[bucket].take(key);
}
