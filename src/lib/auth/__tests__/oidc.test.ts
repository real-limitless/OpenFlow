import { describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT, exportJWK } from "jose";
import {
  OIDC_PASSWORD_SENTINEL,
  buildAuthorizationUrl,
  decideOidcProvision,
  extractEmailFromClaims,
  generatePkce,
  isOidcPasswordHash,
  newOidcFlow,
  oidcReady,
  parseOidcFlow,
  parseOidcSettings,
  publicOidcStatus,
  safeReturnTo,
  signOidcFlow,
  verifyOidcIdToken,
} from "../oidc";

describe("OIDC settings", () => {
  it("parses stored settings and env overlay", () => {
    const s = parseOidcSettings(
      {
        enabled: true,
        issuer: "https://idp.example/realms/app",
        clientId: "openflow",
        clientSecret: "s3cret",
        jitProvisioning: false,
      },
      {},
    );
    expect(s.enabled).toBe(true);
    expect(s.issuer).toBe("https://idp.example/realms/app");
    expect(s.jitProvisioning).toBe(false);
    expect(oidcReady(s)).toBe(true);
    expect(publicOidcStatus(s)).toEqual({ enabled: true, issuer: "idp.example" });
  });

  it("enables from OPENFLOW_OIDC_* env", () => {
    const s = parseOidcSettings(
      {},
      {
        OPENFLOW_OIDC_ISSUER: "https://login.example",
        OPENFLOW_OIDC_CLIENT_ID: "cid",
        OPENFLOW_OIDC_CLIENT_SECRET: "secret",
      },
    );
    expect(s.enabled).toBe(true);
    expect(s.clientId).toBe("cid");
  });

  it("honors OPENFLOW_OIDC_ENABLED=false", () => {
    const s = parseOidcSettings(
      { enabled: true, issuer: "https://idp.example", clientId: "x", clientSecret: "y" },
      { OPENFLOW_OIDC_ENABLED: "false" },
    );
    expect(s.enabled).toBe(false);
    expect(oidcReady(s)).toBe(false);
  });
});

describe("OIDC helpers", () => {
  it("rejects password hashes that are the SSO sentinel", () => {
    expect(isOidcPasswordHash(OIDC_PASSWORD_SENTINEL)).toBe(true);
    expect(isOidcPasswordHash("$2a$10$notreal")).toBe(false);
  });

  it("builds a PKCE authorization URL", () => {
    const pkce = generatePkce();
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    const url = buildAuthorizationUrl({
      authorizationEndpoint: "https://idp.example/authorize",
      clientId: "openflow",
      redirectUri: "http://localhost:8080/api/v1/auth/oidc/callback",
      state: "st",
      nonce: "nn",
      challenge: pkce.challenge,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("scope")).toContain("openid");
  });

  it("round-trips a signed flow cookie", () => {
    const flow = newOidcFlow("/workflows");
    const raw = signOidcFlow(flow, "secret");
    expect(parseOidcFlow(raw, "secret")).toMatchObject({
      state: flow.state,
      nonce: flow.nonce,
      returnTo: "/workflows",
    });
    expect(parseOidcFlow(raw, "other")).toBeNull();
  });

  it("sanitizes returnTo", () => {
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("//evil")).toBe("/");
    expect(safeReturnTo("/settings")).toBe("/settings");
  });

  it("extracts email from claims", () => {
    expect(extractEmailFromClaims({ email: "A@Example.COM" })).toBe("a@example.com");
    expect(extractEmailFromClaims({ preferred_username: "user@idp.example" })).toBe("user@idp.example");
    expect(extractEmailFromClaims({ sub: "abc" })).toBeNull();
  });

  it("provisions first SSO user as owner and later as JIT member", () => {
    expect(decideOidcProvision({ existingRole: null, realUserCount: 0, jit: false, registrationOpen: false })).toEqual({
      ok: true,
      action: "create",
      role: "owner",
    });
    expect(decideOidcProvision({ existingRole: "member", realUserCount: 3, jit: false, registrationOpen: false })).toEqual({
      ok: true,
      action: "login",
    });
    expect(decideOidcProvision({ existingRole: null, realUserCount: 2, jit: true, registrationOpen: false })).toEqual({
      ok: true,
      action: "create",
      role: "member",
    });
    expect(
      decideOidcProvision({ existingRole: null, realUserCount: 2, jit: false, registrationOpen: false }).ok,
    ).toBe(false);
  });
});

describe("OIDC id_token", () => {
  it("verifies a signed token against JWKS", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "k1";
    jwk.use = "sig";
    jwk.alg = "RS256";
    const issuer = "https://idp.example";
    const nonce = "nonce-1";
    const jwt = await new SignJWT({ email: "sso@example.com", nonce })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(issuer)
      .setAudience("openflow")
      .setExpirationTime("5m")
      .sign(privateKey);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("jwks")) {
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("no", { status: 404 });
    }) as typeof fetch;
    try {
      const payload = await verifyOidcIdToken({
        idToken: jwt,
        issuer,
        clientId: "openflow",
        nonce,
        jwksUri: "https://idp.example/jwks",
      });
      expect(payload.email).toBe("sso@example.com");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
