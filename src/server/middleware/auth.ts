import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { getSessionUserId } from "../services/sessions";
import { ensureUser, LOCAL_USER_ID } from "../services/users";
import { config } from "../../config";
import { ALL_MCP_SCOPES } from "../oauth/scopes";
import { resolveAccessToken } from "../oauth/tokens";
import { mcpResourceUrl, publicOrigin } from "../oauth/public-url";

export type AppEnv = {
  Variables: {
    userId: string;
    scopes: string[];
    authKind: "session" | "api_key" | "oauth" | "disabled";
  };
};

const EXEMPT_PATHS = [
  "/health",
  "/api/v1/auth",
  "/api/v1/setup",
  "/webhook",
  "/form",
  "/.well-known",
  "/authorize",
  "/register",
  "/token",
];

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.some((ep) => path === ep || path.startsWith(ep + "/"));
}

function isMcpPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/mcp/");
}

/** Public template marketplace reads (import/sync still require auth). */
function isPublicTemplateGet(method: string, path: string): boolean {
  if (method !== "GET") return false;
  if (path === "/api/v1/templates" || path === "/api/v1/templates/facets") return true;
  if (path === "/api/v1/template-sources/status") return true;
  const m = path.match(/^\/api\/v1\/templates\/([^/]+)(?:\/workflow)?$/);
  if (!m) return false;
  return m[1] !== "import";
}

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

async function getUserIdFromApiKey(rawKey: string): Promise<string | null> {
  if (!rawKey.startsWith("of_")) return null;

  const keyHash = hashApiKey(rawKey);
  const byHash = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { userId: true },
  });
  if (byHash) return byHash.userId;

  const legacy = await prisma.apiKey.findMany({
    where: { keyHash: { startsWith: "$2" } },
    select: { keyHash: true, userId: true },
  });
  for (const row of legacy) {
    if (await bcrypt.compare(rawKey, row.keyHash)) {
      return row.userId;
    }
  }
  return null;
}

function unauthorizedMcp(c: Context<AppEnv>) {
  const origin = publicOrigin(c);
  const resource = mcpResourceUrl(origin);
  const meta = `${origin}/.well-known/oauth-protected-resource`;
  return c.json(
    { error: "Authentication required" },
    401,
    {
      "WWW-Authenticate": `Bearer realm="openflow", resource_metadata="${meta}", scope="${ALL_MCP_SCOPES.join(" ")}"`,
      "Access-Control-Expose-Headers": "WWW-Authenticate",
    },
  );
}

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  // CORS preflight
  if (c.req.method === "OPTIONS") {
    return next();
  }

  if (config.auth.disabled) {
    await ensureUser(LOCAL_USER_ID);
    c.set("userId", LOCAL_USER_ID);
    c.set("scopes", [...ALL_MCP_SCOPES]);
    c.set("authKind", "disabled");
    return next();
  }

  const path = new URL(c.req.url).pathname;
  if (isExempt(path)) {
    return next();
  }
  if (isPublicTemplateGet(c.req.method, path)) {
    const token = getCookie(c, "session");
    const sessionUser = await getSessionUserId(token);
    if (sessionUser) {
      c.set("userId", sessionUser);
      c.set("scopes", [...ALL_MCP_SCOPES]);
      c.set("authKind", "session");
    }
    return next();
  }

  const xApiKey = c.req.header("X-API-Key");
  if (xApiKey) {
    const userId = await getUserIdFromApiKey(xApiKey.startsWith("Bearer ") ? xApiKey.slice(7) : xApiKey);
    if (userId) {
      c.set("userId", userId);
      c.set("scopes", [...ALL_MCP_SCOPES]);
      c.set("authKind", "api_key");
      return next();
    }
  }

  const authHeader = c.req.header("Authorization");
  const bearer = extractBearer(authHeader);
  if (bearer) {
    if (bearer.startsWith("of_")) {
      const userId = await getUserIdFromApiKey(bearer);
      if (userId) {
        c.set("userId", userId);
        c.set("scopes", [...ALL_MCP_SCOPES]);
        c.set("authKind", "api_key");
        return next();
      }
    }
    if (bearer.startsWith("ofa_")) {
      const resolved = await resolveAccessToken(bearer);
      if (resolved) {
        c.set("userId", resolved.userId);
        c.set("scopes", resolved.scopes);
        c.set("authKind", "oauth");
        return next();
      }
    }
  }

  const token = getCookie(c, "session");
  const userId = await getSessionUserId(token);
  if (!userId) {
    if (isMcpPath(path)) {
      return unauthorizedMcp(c);
    }
    return c.json({ error: "Authentication required" }, 401);
  }

  c.set("userId", userId);
  c.set("scopes", [...ALL_MCP_SCOPES]);
  c.set("authKind", "session");
  return next();
}
