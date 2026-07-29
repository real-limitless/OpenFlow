import type { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";

const SESSION_MAX_AGE = 86400; // 24 hours

const sessions = new Map<string, { userId: string; expiresAt: number }>();

export function getSessionUserId(token: string | undefined): string | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.userId;
}

function createSession(
  c: { req: { raw: Request }; json: (data: unknown, status?: number) => Response },
  userId: string,
) {
  const token = crypto.randomUUID();
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_MAX_AGE * 1000 });
  setCookie(c as never, "session", token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE,
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function authRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/auth/register", async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>();
    const { email, password } = body ?? {};

    if (!email || !isValidEmail(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }
    if (!password || password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return c.json({ error: "Email already registered" }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });

    createSession(c, user.id);
    return c.json(user, 201);
  });

  app.post("/api/v1/auth/login", async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>();
    const { email, password } = body ?? {};

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    createSession(c, user.id);
    return c.json({ id: user.id, email: user.email });
  });

  app.post("/api/v1/auth/logout", (c) => {
    const token = getCookie(c, "session");
    if (token) sessions.delete(token);
    deleteCookie(c, "session", { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/api/v1/auth/me", async (c) => {
    const token = getCookie(c, "session");
    const userId = getSessionUserId(token);
    if (!userId) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    return c.json(user);
  });
}
