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
import {
  canPublicRegister,
  isLoginDisabled,
  isRegistrationDisabled,
  sessionCookieSecure,
} from "../../lib/auth/registration-policy";
import { issueCsrfCookie } from "../middleware/csrf";
import { consumeInviteToken } from "../services/invites";
import { recordAudit, requestIp } from "../services/audit";
import { hashEmail } from "../lib/email-hash";
import { noteAccessLog } from "../../lib/observability/request-context";
import { loginBodySchema, registerBodySchema } from "../validation/auth";
import { getRegistrationOpen, registrationAllowsPublic } from "../services/registration-setting";
import { getOidcSettings, oidcFlowSecret } from "../services/oidc";
import { publicOrigin } from "../oauth/public-url";
import {
  OIDC_PASSWORD_SENTINEL,
  buildAuthorizationUrl,
  decideOidcProvision,
  defaultRedirectUri,
  extractEmailFromClaims,
  fetchOidcDiscovery,
  exchangeAuthorizationCode,
  isOidcPasswordHash,
  newOidcFlow,
  oidcReady,
  parseOidcFlow,
  publicOidcStatus,
  signOidcFlow,
  verifyOidcIdToken,
} from "../../lib/auth/oidc";

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

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

function emailFromUnknown(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" ? email : "";
}

export default function authRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/auth/register", async (c) => {
    if (isRegistrationDisabled()) {
      noteAccessLog({
        event: "denial",
        action: "admin.registration",
        outcome: "denied",
        audited: true,
      });
      void recordAudit({
        actorId: "anonymous",
        actorEmail: "",
        action: "auth.register_denied",
        resource: "user",
        detail: { reason: "registration_disabled" },
        ip: requestIp(c),
        event: "denial",
        outcome: "denied",
      });
      return c.json({ error: "Registration is disabled", code: "registration_disabled" }, 403);
    }
    const raw = await readJson(c);
    const parsed = registerBodySchema.safeParse(raw);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      const message =
        field === "password" ? "Password must be at least 8 characters" : "Invalid email format";
      noteAccessLog({
        event: "auth_failure",
        action: "auth.register",
        outcome: "failure",
        audited: true,
      });
      void recordAudit({
        actorId: "anonymous",
        actorEmail: "",
        action: "auth.login_failure",
        resource: "user",
        detail: emailFromUnknown(raw) ? { emailHash: hashEmail(emailFromUnknown(raw)) } : {},
        ip: requestIp(c),
        event: "auth_failure",
        outcome: "failure",
      });
      return c.json({ error: message }, 400);
    }
    const { email, password, inviteToken } = parsed.data;

    const realUsers = await countRealUsers();
    let role: string = realUsers === 0 ? "owner" : "member";
    const storedOpen = await getRegistrationOpen();
    if (!registrationAllowsPublic({ hasUsers: realUsers > 0, storedOpen })) {
      const consumed = await consumeInviteToken(inviteToken ?? "", email);
      if (!consumed.ok) {
        noteAccessLog({
          event: "denial",
          action: "admin.registration",
          outcome: "denied",
          audited: true,
        });
        void recordAudit({
          actorId: "anonymous",
          actorEmail: "",
          action: "auth.register_denied",
          resource: "user",
          detail: { emailHash: hashEmail(email), reason: "invite_only" },
          ip: requestIp(c),
          event: "denial",
          outcome: "denied",
        });
        const error =
          realUsers === 0 && !inviteToken
            ? "Public registration is closed. The first owner is not created from an open signup."
            : consumed.error || "Registration is invite-only after the owner account exists";
        return c.json(
          {
            error,
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

    noteAccessLog({
      event: "auth_success",
      action: "user.register",
      outcome: "success",
      actor: user.id,
      audited: true,
    });
    void recordAudit({
      actorId: user.id,
      action: "user.register",
      resource: "user",
      resourceId: user.id,
      detail: { role: user.role },
      ip: requestIp(c),
      event: "admin_action",
      outcome: "success",
    });

    const token = await createSession(user.id);
    setSessionCookie(c, token);
    const csrfToken = issueCsrfCookie(c);
    return c.json({ ...user, csrfToken }, 201);
  });

  app.post("/api/v1/auth/login", async (c) => {
    if (isLoginDisabled()) {
      noteAccessLog({
        event: "denial",
        action: "auth.login",
        outcome: "denied",
        audited: true,
      });
      void recordAudit({
        actorId: "anonymous",
        actorEmail: "",
        action: "auth.login_denied",
        resource: "session",
        detail: { reason: "login_disabled" },
        ip: requestIp(c),
        event: "denial",
        outcome: "denied",
      });
      return c.json({ error: "Login is disabled", code: "login_disabled" }, 403);
    }
    const raw = await readJson(c);
    const parsed = loginBodySchema.safeParse(raw);
    if (!parsed.success) {
      noteAccessLog({
        event: "auth_failure",
        action: "auth.login",
        outcome: "failure",
        audited: true,
      });
      void recordAudit({
        actorId: "anonymous",
        actorEmail: "",
        action: "auth.login_failure",
        resource: "session",
        detail: emailFromUnknown(raw) ? { emailHash: hashEmail(emailFromUnknown(raw)) } : {},
        ip: requestIp(c),
        event: "auth_failure",
        outcome: "failure",
      });
      return c.json({ error: "Email and password are required" }, 400);
    }
    const { email, password } = parsed.data;

    const fail = (status: 401 | 403, body: Record<string, unknown>, actorId: string) => {
      const outcome = status === 403 ? "denied" : "failure";
      const event = status === 403 ? "denial" : "auth_failure";
      noteAccessLog({
        event,
        action: "auth.login",
        outcome,
        actor: actorId === "anonymous" ? undefined : actorId,
        audited: true,
      });
      void recordAudit({
        actorId,
        actorEmail: "",
        action: status === 403 ? "auth.login_denied" : "auth.login_failure",
        resource: "session",
        resourceId: actorId === "anonymous" ? "" : actorId,
        detail: { emailHash: hashEmail(email) },
        ip: requestIp(c),
        event,
        outcome,
      });
      return c.json(body, status);
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return fail(401, { error: "Invalid credentials" }, "anonymous");
    }
    if (isOidcPasswordHash(user.passwordHash)) {
      return fail(401, { error: "Use SSO to sign in", code: "oidc" }, user.id);
    }
    if (user.role === "disabled") {
      return fail(403, { error: "Account disabled", code: "disabled" }, user.id);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return fail(401, { error: "Invalid credentials" }, user.id);
    }

    const token = await createSession(user.id);
    setSessionCookie(c, token);
    const csrfToken = issueCsrfCookie(c);
    noteAccessLog({
      event: "auth_success",
      action: "auth.login",
      outcome: "success",
      actor: user.id,
      audited: true,
    });
    void recordAudit({
      actorId: user.id,
      action: "auth.login_success",
      resource: "session",
      resourceId: user.id,
      detail: {},
      ip: requestIp(c),
      event: "auth_success",
      outcome: "success",
    });
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

  app.get("/api/v1/auth/oidc/status", async (c) => {
    const settings = await getOidcSettings();
    return c.json(publicOidcStatus(settings));
  });

  app.get("/api/v1/auth/oidc/start", async (c) => {
    if (isLoginDisabled()) {
      return c.json({ error: "Login is disabled", code: "login_disabled" }, 403);
    }
    const settings = await getOidcSettings();
    if (!oidcReady(settings)) {
      return c.json({ error: "OIDC is not configured" }, 400);
    }
    try {
      const origin = publicOrigin(c);
      const redirectUri = settings.redirectUri || defaultRedirectUri(origin);
      const discovery = await fetchOidcDiscovery(settings.issuer);
      const flow = newOidcFlow(c.req.query("redirect"));
      setCookie(c, "oidc_flow", signOidcFlow(flow, oidcFlowSecret()), {
        httpOnly: true,
        path: "/",
        sameSite: "Lax",
        maxAge: 600,
        secure: sessionCookieSecure({
          url: c.req.url,
          forwardedProto: c.req.header("x-forwarded-proto"),
        }),
      });
      return c.redirect(
        buildAuthorizationUrl({
          authorizationEndpoint: discovery.authorization_endpoint,
          clientId: settings.clientId,
          redirectUri,
          state: flow.state,
          nonce: flow.nonce,
          challenge: flow.challenge,
        }),
      );
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "OIDC start failed" }, 502);
    }
  });

  app.get("/api/v1/auth/oidc/callback", async (c) => {
    if (isLoginDisabled()) {
      return c.json({ error: "Login is disabled", code: "login_disabled" }, 403);
    }
    const idpError = c.req.query("error");
    if (idpError) {
      return c.json({ error: idpError, description: c.req.query("error_description") ?? "" }, 400);
    }
    const code = c.req.query("code");
    const state = c.req.query("state");
    const flow = parseOidcFlow(getCookie(c, "oidc_flow"), oidcFlowSecret());
    deleteCookie(c, "oidc_flow", { path: "/" });
    if (!code || !flow || state !== flow.state) {
      return c.json({ error: "Invalid OIDC state" }, 400);
    }
    const settings = await getOidcSettings();
    if (!oidcReady(settings)) {
      return c.json({ error: "OIDC is not configured" }, 400);
    }
    try {
      const origin = publicOrigin(c);
      const redirectUri = settings.redirectUri || defaultRedirectUri(origin);
      const discovery = await fetchOidcDiscovery(settings.issuer);
      const tokens = await exchangeAuthorizationCode({
        tokenEndpoint: discovery.token_endpoint,
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        code,
        redirectUri,
        codeVerifier: flow.verifier,
      });
      const claims = await verifyOidcIdToken({
        idToken: tokens.id_token,
        issuer: settings.issuer,
        clientId: settings.clientId,
        nonce: flow.nonce,
        jwksUri: discovery.jwks_uri,
      });
      const email = extractEmailFromClaims(claims);
      if (!email) {
        return c.json({ error: "OIDC token did not include an email claim" }, 400);
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      const realUsers = await countRealUsers();
      const decision = decideOidcProvision({
        existingRole: existing?.role ?? null,
        realUserCount: realUsers,
        jit: settings.jitProvisioning,
        registrationOpen: canPublicRegister(realUsers > 0),
      });
      if (!decision.ok) {
        return c.json({ error: decision.error, code: "oidc" }, decision.status);
      }
      if (decision.action === "create" && isRegistrationDisabled()) {
        return c.json({ error: "Registration is disabled", code: "registration_disabled" }, 403);
      }
      let user = existing;
      if (decision.action === "create") {
        user = await prisma.user.create({
          data: {
            email,
            passwordHash: OIDC_PASSWORD_SENTINEL,
            role: decision.role,
          },
        });
        await ensureUserWithProject(user.id);
        void recordAudit({
          actorId: user.id,
          action: "user.register",
          resource: "user",
          resourceId: user.id,
          detail: { role: user.role, method: "oidc" },
          ip: requestIp(c),
          event: "admin_action",
          outcome: "success",
        });
      }
      if (!user) {
        return c.json({ error: "OIDC login failed" }, 500);
      }
      noteAccessLog({
        event: "auth_success",
        action: "auth.login",
        outcome: "success",
        actor: user.id,
        audited: true,
      });
      void recordAudit({
        actorId: user.id,
        action: "auth.login_success",
        resource: "session",
        resourceId: user.id,
        detail: { method: "oidc" },
        ip: requestIp(c),
        event: "auth_success",
        outcome: "success",
      });
      const token = await createSession(user.id);
      setSessionCookie(c, token);
      issueCsrfCookie(c);
      return c.redirect(flow.returnTo || "/");
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "OIDC callback failed" }, 502);
    }
  });
}
