import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { getSessionUserId } from "../services/sessions";
import { ensureUser, LOCAL_USER_ID } from "../services/users";
import { config } from "../../config";

export type AppEnv = { Variables: { userId: string } };

const EXEMPT_PATHS = ["/health", "/api/v1/auth", "/webhook", "/form"];

/** Public template marketplace reads (import still requires auth). */
function isPublicTemplateGet(method: string, path: string): boolean {
  if (method !== "GET") return false;
  if (path === "/api/v1/templates" || path === "/api/v1/templates/facets") return true;
  // /api/v1/templates/:id or /api/v1/templates/:id/workflow
  const m = path.match(/^\/api\/v1\/templates\/([^/]+)(?:\/workflow)?$/);
  if (!m) return false;
  // reject reserved words that aren't ids if any appear later
  return m[1] !== "import";
}

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

async function getUserIdFromApiKey(header: string | undefined): Promise<string | null> {
  if (!header) return null;
  const key = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!key.startsWith("of_")) return null;

  const keyHash = hashApiKey(key);
  const byHash = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { userId: true },
  });
  if (byHash) return byHash.userId;

  // Legacy bcrypt-hashed keys (pre-E0)
  const legacy = await prisma.apiKey.findMany({
    where: { keyHash: { startsWith: "$2" } },
    select: { keyHash: true, userId: true },
  });
  for (const row of legacy) {
    if (await bcrypt.compare(key, row.keyHash)) {
      return row.userId;
    }
  }
  return null;
}

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  if (config.auth.disabled) {
    await ensureUser(LOCAL_USER_ID);
    c.set("userId", LOCAL_USER_ID);
    return next();
  }

  const path = new URL(c.req.url).pathname;
  if (EXEMPT_PATHS.some((ep) => path === ep || path.startsWith(ep + "/"))) {
    return next();
  }
  if (isPublicTemplateGet(c.req.method, path)) {
    // Optional session: attach userId when present so clients can stay logged in
    const token = getCookie(c, "session");
    const sessionUser = await getSessionUserId(token);
    if (sessionUser) c.set("userId", sessionUser);
    return next();
  }

  const apiKeyHeader = c.req.header("X-API-Key") ?? c.req.header("Authorization");
  if (apiKeyHeader) {
    const userId = await getUserIdFromApiKey(apiKeyHeader);
    if (userId) {
      c.set("userId", userId);
      return next();
    }
  }

  const token = getCookie(c, "session");
  const userId = await getSessionUserId(token);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  c.set("userId", userId);
  return next();
}
