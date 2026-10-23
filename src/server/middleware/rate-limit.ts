import type { Context, Next } from "hono";
import type { AppEnv } from "./auth";
import { noteAccessLog } from "../../lib/observability/request-context";
import { resolveClientIp, socketRemoteAddress } from "../../lib/security/client-ip";
import { rateLimitBucketForPath, takeRateLimit } from "../../lib/security/rate-limit";
import { log } from "../log";

function clientKey(c: Context<AppEnv>): string {
  return resolveClientIp({
    remoteAddress: socketRemoteAddress(c),
    forwardedFor: c.req.header("x-forwarded-for"),
    cfConnectingIp: c.req.header("cf-connecting-ip"),
  });
}

export async function rateLimitMiddleware(c: Context<AppEnv>, next: Next) {
  const path = c.req.path;
  if (
    c.req.method === "OPTIONS" ||
    path === "/health" ||
    path.startsWith("/health/") ||
    path === "/metrics"
  ) {
    return next();
  }
  const bucket = rateLimitBucketForPath(path);
  const result = await takeRateLimit(bucket, `${bucket}:${clientKey(c)}`);
  c.header("X-RateLimit-Limit", String(result.limit));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    c.header("Retry-After", String(result.retryAfterSec));
    const clientIp = clientKey(c);
    noteAccessLog({
      event: "rate_limit",
      action: "rate_limit",
      outcome: "denied",
    });
    log.warn("rate_limit", {
      event: "rate_limit",
      action: "rate_limit",
      outcome: "denied",
      status: 429,
      path,
      method: c.req.method,
      client_ip: clientIp === "local" ? null : clientIp,
    });
    return c.json({ error: "Too many requests", retryAfter: result.retryAfterSec }, 429);
  }
  return next();
}
