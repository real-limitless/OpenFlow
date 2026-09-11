import type { Context, Next } from "hono";
import type { AppEnv } from "./auth";
import { config } from "../../config";
import {
  defaultCorsMode,
  isFrameablePath,
  isHttpsRequest,
  parseCorsOrigins,
  resolveCorsOrigin,
  securityHeaderMap,
} from "../../lib/security/http-headers";

function allowlist(): string[] {
  return parseCorsOrigins(process.env.OPENFLOW_CORS_ORIGINS);
}

export async function securityHeadersMiddleware(c: Context<AppEnv>, next: Next) {
  const path = c.req.path;
  const origin = c.req.header("origin");
  const mode = defaultCorsMode({
    authDisabled: config.auth.disabled,
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
  const allowed = resolveCorsOrigin(origin, allowlist(), mode);

  const headers = securityHeaderMap({
    https: isHttpsRequest(c.req.url, c.req.header("x-forwarded-proto")),
    frameable: isFrameablePath(path),
  });
  for (const [k, v] of Object.entries(headers)) {
    c.header(k, v);
  }

  if (allowed) {
    c.header("Access-Control-Allow-Origin", allowed);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Credentials", "true");
    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-API-Key, X-CSRF-Token, X-OpenFlow-Webhook-Secret, X-OpenFlow-Workflow-Id, Mcp-Session-Id, MCP-Protocol-Version, Accept",
    );
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    c.header("Access-Control-Max-Age", "86400");
  }

  if (c.req.method === "OPTIONS") {
    return c.body(null, allowed ? 204 : 403);
  }

  return next();
}

export function corsAllowlistForSettings() {
  const origins = allowlist();
  const mode = defaultCorsMode({
    authDisabled: config.auth.disabled,
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
  return {
    origins,
    mode,
    envConfigured: Boolean(process.env.OPENFLOW_CORS_ORIGINS?.trim()),
    headers: [
      "X-Content-Type-Options",
      "Referrer-Policy",
      "X-Frame-Options",
      "Permissions-Policy",
      "Strict-Transport-Security (HTTPS)",
    ],
  };
}
