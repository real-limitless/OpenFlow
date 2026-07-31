import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { getSessionUserId } from "../routes/auth";
import { config } from "../../config";

export type AppEnv = { Variables: { userId: string } };

const EXEMPT_PATHS = ["/health", "/api/v1/auth", "/webhook"];

async function getUserIdFromApiKey(header: string | undefined): Promise<string | null> {
  if (!header) return null;
  const key = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!key.startsWith("of_")) return null;

  const keys = await prisma.apiKey.findMany({
    select: { keyHash: true, userId: true },
  });

  for (const row of keys) {
    if (await bcrypt.compare(key, row.keyHash)) {
      return row.userId;
    }
  }
  return null;
}

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  if (config.auth.disabled) {
    c.set("userId", "local");
    return next();
  }

  const path = new URL(c.req.url).pathname;
  if (EXEMPT_PATHS.some((ep) => path === ep || path.startsWith(ep + "/"))) {
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
  const userId = getSessionUserId(token);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  c.set("userId", userId);
  return next();
}
