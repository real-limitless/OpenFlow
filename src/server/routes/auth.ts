import type { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import {
  SESSION_MAX_AGE_SEC,
  createSession,
  destroySession,
  getSessionUserId,
} from "../services/sessions";

export { getSessionUserId } from "../services/sessions";

function setSessionCookie(
  c: { req: { raw: Request }; json: (data: unknown, status?: number) => Response },
  token: string,
) {
  setCookie(c as never, "session", token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE_SEC,
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
      data: { email, passwordHash, role: "member" },
      select: { id: true, email: true, role: true },
    });

    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.json(user, 201);
  });

  app.post("/api/v1/auth/login", async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>();
    const { email, password } = body ?? {};

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.json({ id: user.id, email: user.email, role: user.role });
  });

  app.post("/api/v1/auth/logout", async (c) => {
    const token = getCookie(c, "session");
    await destroySession(token);
    deleteCookie(c, "session", { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/api/v1/auth/me", async (c) => {
    const token = getCookie(c, "session");
    const userId = await getSessionUserId(token);
    if (!userId) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    return c.json(user);
  });
}
