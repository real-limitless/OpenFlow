import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../../config";

export const CSRF_COOKIE = "csrf";
export const CSRF_HEADER = "x-csrf-token";

const EXEMPT_PREFIXES = [
  "/health",
  "/metrics",
  "/webhook",
  "/form",
  "/chat",
  "/token",
  "/authorize",
  "/register",
  "/.well-known",
  "/mcp",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/setup",
];

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function csrfTokensMatch(cookie: string | undefined, presented: string | undefined): boolean {
  if (!cookie || !presented) return false;
  const a = Buffer.from(cookie, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function csrfProtectsRequest(opts: {
  method: string;
  path: string;
  authKind: string | undefined;
  authDisabled: boolean;
}): boolean {
  if (opts.authDisabled) return false;
  const method = opts.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (opts.authKind && opts.authKind !== "session") return false;
  if (!opts.authKind) return false;
  return !EXEMPT_PREFIXES.some((p) => opts.path === p || opts.path.startsWith(`${p}/`));
}

/** Bind a cookie value so a stolen header without the cookie fails (double-submit). */
export function signCsrfCookie(token: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(token).digest("hex").slice(0, 16);
  return `${token}.${sig}`;
}

export function parseCsrfCookie(raw: string | undefined, secret: string): string | undefined {
  if (!raw || !raw.includes(".")) return undefined;
  const token = raw.slice(0, raw.lastIndexOf("."));
  const expected = signCsrfCookie(token, secret);
  const a = Buffer.from(raw, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return undefined;
  if (!timingSafeEqual(a, b)) return undefined;
  return token;
}

export function csrfSecret(): string {
  return config.credentials.key || "openflow-csrf-dev";
}
