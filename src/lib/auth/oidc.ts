import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/** Non-bcrypt marker so password login fails for SSO-only accounts. */
export const OIDC_PASSWORD_SENTINEL = "oidc";

export type OidcSettings = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  jitProvisioning: boolean;
};

export type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
};

export type OidcFlow = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
};

export function isOidcPasswordHash(hash: string | null | undefined): boolean {
  return hash === OIDC_PASSWORD_SENTINEL;
}

export function parseOidcSettings(raw: unknown, env: NodeJS.ProcessEnv = process.env): OidcSettings {
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const issuer = (
    env.OPENFLOW_OIDC_ISSUER?.trim() ||
    (typeof stored.issuer === "string" ? stored.issuer : "")
  ).replace(/\/$/, "");
  const clientId =
    env.OPENFLOW_OIDC_CLIENT_ID?.trim() || (typeof stored.clientId === "string" ? stored.clientId : "");
  const clientSecret =
    env.OPENFLOW_OIDC_CLIENT_SECRET?.trim() ||
    (typeof stored.clientSecret === "string" ? stored.clientSecret : "");
  const redirectUri =
    env.OPENFLOW_OIDC_REDIRECT_URI?.trim() ||
    (typeof stored.redirectUri === "string" ? stored.redirectUri : "");
  const jitProvisioning = stored.jitProvisioning !== false;
  const envEnabled = env.OPENFLOW_OIDC_ENABLED;
  let enabled = stored.enabled === true;
  if (envEnabled === "true" || envEnabled === "1") enabled = true;
  if (envEnabled === "false" || envEnabled === "0") enabled = false;
  if (envEnabled === undefined && env.OPENFLOW_OIDC_ISSUER && env.OPENFLOW_OIDC_CLIENT_ID) {
    enabled = true;
  }
  return { enabled, issuer, clientId, clientSecret, redirectUri, jitProvisioning };
}

export function oidcReady(s: OidcSettings): boolean {
  return Boolean(s.enabled && s.issuer && s.clientId && s.clientSecret);
}

export function publicOidcStatus(s: OidcSettings): {
  enabled: boolean;
  issuer: string;
} {
  let issuerHost = "";
  try {
    issuerHost = s.issuer ? new URL(s.issuer).host : "";
  } catch {
    issuerHost = "";
  }
  return { enabled: oidcReady(s) || Boolean(s.enabled && s.issuer && s.clientId), issuer: issuerHost };
}

export function safeReturnTo(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/";
  return raw;
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function newOidcFlow(returnTo?: string): OidcFlow & { challenge: string } {
  const { verifier, challenge } = generatePkce();
  return {
    state: randomBytes(16).toString("hex"),
    nonce: randomBytes(16).toString("hex"),
    verifier,
    returnTo: safeReturnTo(returnTo),
    challenge,
  };
}

export function signOidcFlow(flow: OidcFlow, secret: string): string {
  const payload = Buffer.from(JSON.stringify(flow), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function parseOidcFlow(raw: string | undefined, secret: string): OidcFlow | null {
  if (!raw || !raw.includes(".")) return null;
  const cut = raw.lastIndexOf(".");
  const payload = raw.slice(0, cut);
  const sig = raw.slice(cut + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OidcFlow;
    if (!parsed.state || !parsed.nonce || !parsed.verifier) return null;
    return { ...parsed, returnTo: safeReturnTo(parsed.returnTo) };
  } catch {
    return null;
  }
}

export function buildAuthorizationUrl(opts: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
}): string {
  const url = new URL(opts.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("nonce", opts.nonce);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function extractEmailFromClaims(claims: JWTPayload | Record<string, unknown>): string | null {
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (email && email.includes("@")) return email;
  const preferred =
    typeof claims.preferred_username === "string" ? claims.preferred_username.trim().toLowerCase() : "";
  if (preferred.includes("@")) return preferred;
  return null;
}

export type OidcProvisionDecision =
  | { ok: true; action: "login" }
  | { ok: true; action: "create"; role: "owner" | "member" }
  | { ok: false; error: string; status: 403 };

export function decideOidcProvision(opts: {
  existingRole: string | null;
  realUserCount: number;
  jit: boolean;
  registrationOpen: boolean;
}): OidcProvisionDecision {
  if (opts.existingRole === "disabled") {
    return { ok: false, error: "Account disabled", status: 403 };
  }
  if (opts.existingRole) return { ok: true, action: "login" };
  if (opts.realUserCount === 0) return { ok: true, action: "create", role: "owner" };
  if (opts.jit || opts.registrationOpen) return { ok: true, action: "create", role: "member" };
  return {
    ok: false,
    error: "SSO cannot create accounts while invite-only JIT is off",
    status: 403,
  };
}

export async function fetchOidcDiscovery(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OidcDiscovery> {
  const base = issuer.replace(/\/$/, "");
  const res = await fetchImpl(`${base}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
  const body = (await res.json()) as Record<string, unknown>;
  const authorization_endpoint =
    typeof body.authorization_endpoint === "string" ? body.authorization_endpoint : "";
  const token_endpoint = typeof body.token_endpoint === "string" ? body.token_endpoint : "";
  const jwks_uri = typeof body.jwks_uri === "string" ? body.jwks_uri : "";
  if (!authorization_endpoint || !token_endpoint || !jwks_uri) {
    throw new Error("OIDC discovery missing authorization, token, or JWKS endpoints");
  }
  return {
    authorization_endpoint,
    token_endpoint,
    jwks_uri,
    userinfo_endpoint:
      typeof body.userinfo_endpoint === "string" ? body.userinfo_endpoint : undefined,
  };
}

export async function exchangeAuthorizationCode(opts: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}): Promise<{ id_token: string; access_token?: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetchImpl(opts.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    throw new Error(`OIDC token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const idToken = typeof json.id_token === "string" ? json.id_token : "";
  if (!idToken) throw new Error("OIDC token response missing id_token");
  return {
    id_token: idToken,
    access_token: typeof json.access_token === "string" ? json.access_token : undefined,
  };
}

export async function verifyOidcIdToken(opts: {
  idToken: string;
  issuer: string;
  clientId: string;
  nonce: string;
  jwksUri: string;
}): Promise<JWTPayload> {
  const JWKS = createRemoteJWKSet(new URL(opts.jwksUri));
  const { payload } = await jwtVerify(opts.idToken, JWKS, {
    issuer: opts.issuer.replace(/\/$/, ""),
    audience: opts.clientId,
  });
  if (payload.nonce !== opts.nonce) {
    throw new Error("OIDC nonce mismatch");
  }
  return payload;
}

export function defaultRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/v1/auth/oidc/callback`;
}
