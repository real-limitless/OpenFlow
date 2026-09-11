import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./auth";
import { config } from "../../config";
import { sessionCookieSecure } from "../../lib/auth/registration-policy";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  csrfProtectsRequest,
  csrfSecret,
  csrfTokensMatch,
  generateCsrfToken,
  parseCsrfCookie,
  signCsrfCookie,
} from "../../lib/security/csrf";

export function issueCsrfCookie(c: Context<AppEnv>, token = generateCsrfToken()): string {
  const signed = signCsrfCookie(token, csrfSecret());
  setCookie(c, CSRF_COOKIE, signed, {
    httpOnly: false,
    path: "/",
    sameSite: "Lax",
    secure: sessionCookieSecure({
      url: c.req.url,
      forwardedProto: c.req.header("x-forwarded-proto"),
    }),
  });
  return token;
}

export function readCsrfToken(c: Context<AppEnv>): string | undefined {
  return parseCsrfCookie(getCookie(c, CSRF_COOKIE), csrfSecret());
}

export async function csrfMiddleware(c: Context<AppEnv>, next: Next) {
  const path = c.req.path;
  let authKind: string | undefined;
  try {
    authKind = c.get("authKind");
  } catch {
    authKind = undefined;
  }

  if (
    csrfProtectsRequest({
      method: c.req.method,
      path,
      authKind,
      authDisabled: config.auth.disabled,
    })
  ) {
    const cookieToken = readCsrfToken(c);
    const header = c.req.header(CSRF_HEADER) ?? c.req.header("X-CSRF-Token");
    if (!csrfTokensMatch(cookieToken, header ?? undefined)) {
      return c.json(
        {
          error: "CSRF token missing or invalid",
          code: "csrf",
        },
        403,
      );
    }
  }

  return next();
}
