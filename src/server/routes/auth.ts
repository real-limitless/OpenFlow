import type { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { config } from "../../config";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import {
  SESSION_MAX_AGE_SEC,
  createSession,
  destroySession,
  getSessionUserId,
} from "../services/sessions";
import { ensureUser, ensureUserWithProject, LOCAL_USER_ID } from "../services/users";
import { countRealUsers } from "./setup";
import { canPublicRegister, sessionCookieSecure } from "../../lib/auth/registration-policy";
import { issueCsrfCookie } from "../middleware/csrf";
import { consumeInviteToken } from "../services/invites";
import { recordAudit, requestIp } from "../services/audit";

export { getSessionUserId } from "../services/sessions";

function setSessionCookie(
  c: { req: { raw: Request; url: string; header: (name: string) => string | undefined } },
  token: string,
) {
  setCookie(c as never, "session", token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: sessionCookieSecure({
      url: c.req.url,
      forwardedProto: c.req.header("x-forwarded-proto"),
    }),
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function authRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/auth/register", async (c) => {
    const body = await c.req.json<{ email?: string; password?: string; inviteToken?: string }>();
    const { email, password, inviteToken } = body ?? {};

    if (!email || !isValidEmail(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }
    if (!password || password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const realUsers = await countRealUsers();
    let role: string = realUsers === 0 ? "owner" : "member";
    if (!canPublicRegister(realUsers > 0)) {
      const consumed = await consumeInviteToken(inviteToken ?? "", email);
      if (!consumed.ok) {
        return c.json(
          {
            error: consumed.error || "Registration is invite-only after the owner account exists",
            code: "invite_only",
          },
          403,
        );
      }
      role = realUsers === 0 ? "owner" : consumed.role;
    } else if (inviteToken) {
      const consumed = await consumeInviteToken(inviteToken, email);
      if (consumed.ok && realUsers > 0) role = consumed.role;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return c.json({ error: "Email already registered" }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, role },
      select: { id: true, email: true, role: true },
    });

    await ensureUserWithProject(user.id);

    void recordAudit({
      actorId: user.id,
      action: "user.register",
      resource: "user",
      resourceId: user.id,
      detail: { email: user.email, role: user.role },
      ip: requestIp(c),
    });

    const token = await createSession(user.id);
    setSessionCookie(c, token);
    const csrfToken = issueCsrfCookie(c);
    return c.json({ ...user, csrfToken }, 201);
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
    if (user.role === "disabled") {
      return c.json({ error: "Account disabled", code: "disabled" }, 403);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = await createSession(user.id);
    setSessionCookie(c, token);
    const csrfToken = issueCsrfCookie(c);
    return c.json({ id: user.id, email: user.email, role: user.role, csrfToken });
  });

  app.post("/api/v1/auth/logout", async (c) => {
    const token = getCookie(c, "session");
    await destroySession(token);
    deleteCookie(c, "session", { path: "/" });
    deleteCookie(c, "csrf", { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/api/v1/auth/me", async (c) => {
    // Always 200 so SPA session probes don't spam the browser console with 401.
    // Shape: { user: AuthUser | null, authDisabled: boolean }
    if (config.auth.disabled) {
      await ensureUser(LOCAL_USER_ID);
      const user = await prisma.user.findUnique({
        where: { id: LOCAL_USER_ID },
        select: { id: true, email: true, role: true },
      });
      return c.json({
        user: user ?? { id: LOCAL_USER_ID, email: "local@local", role: "owner" },
        authDisabled: true,
        csrfToken: issueCsrfCookie(c),
      });
    }

    const token = getCookie(c, "session");
    const userId = await getSessionUserId(token);
    if (!userId) {
      return c.json({ user: null, authDisabled: false, csrfToken: issueCsrfCookie(c) });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      return c.json({ user: null, authDisabled: false, csrfToken: issueCsrfCookie(c) });
    }

    return c.json({ user, authDisabled: false, csrfToken: issueCsrfCookie(c) });
  });
}
