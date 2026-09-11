import type { Context, Next } from "hono";
import type { AppEnv } from "./auth";
import {
  MemoryRateLimiter,
  RATE_LIMITS,
  rateLimitBucketForPath,
} from "../../lib/security/rate-limit";

const limiters = {
  auth: new MemoryRateLimiter(RATE_LIMITS.auth.limit, RATE_LIMITS.auth.windowMs),
  webhook: new MemoryRateLimiter(RATE_LIMITS.webhook.limit, RATE_LIMITS.webhook.windowMs),
  form: new MemoryRateLimiter(RATE_LIMITS.form.limit, RATE_LIMITS.form.windowMs),
  api: new MemoryRateLimiter(RATE_LIMITS.api.limit, RATE_LIMITS.api.windowMs),
};

function clientKey(c: Context<AppEnv>): string {
  const xf = c.req.header("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "local";
}

export async function rateLimitMiddleware(c: Context<AppEnv>, next: Next) {
  const path = c.req.path;
  if (path === "/health" || path.startsWith("/health/")) {
    return next();
  }
  const bucket = rateLimitBucketForPath(path);
  const result = limiters[bucket].take(`${bucket}:${clientKey(c)}`);
  c.header("X-RateLimit-Limit", String(result.limit));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    c.header("Retry-After", String(result.retryAfterSec));
    return c.json(
      { error: "Too many requests", retryAfter: result.retryAfterSec },
      429,
    );
  }
  return next();
}
