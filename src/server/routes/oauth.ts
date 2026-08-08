import type { Hono } from "hono";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { config } from "../../config";
import { ALL_MCP_SCOPES, parseScopes, scopesToString } from "../oauth/scopes";
import { mcpResourceUrl, publicOrigin } from "../oauth/public-url";
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  isRedirectUriAllowed,
  newOpaqueToken,
  refreshAccessToken,
  validateNewRedirectUri,
} from "../oauth/tokens";
import { ensureUserWithProject } from "../services/users";

function parseRedirectUris(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { max-width: 420px; margin: 3rem auto; padding: 0 1rem; line-height: 1.45; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .muted { opacity: 0.75; font-size: 0.9rem; margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.85rem; margin: 0.75rem 0 0.25rem; }
    input[type=email], input[type=password], input[type=text] {
      width: 100%; box-sizing: border-box; padding: 0.5rem 0.6rem; border-radius: 6px;
      border: 1px solid #8884; background: transparent;
    }
    button {
      margin-top: 1.25rem; width: 100%; padding: 0.65rem; border: 0; border-radius: 6px;
      background: #2563eb; color: #fff; font-weight: 600; cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
    .error { color: #dc2626; font-size: 0.9rem; margin: 0.75rem 0; }
    .scopes { font-size: 0.85rem; margin: 0.75rem 0; padding: 0.75rem; border-radius: 6px; background: #8881; }
    .scopes li { margin: 0.2rem 0; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export default function oauthRoute(app: Hono<AppEnv>) {
  app.get("/.well-known/oauth-authorization-server", (c) => {
    const origin = publicOrigin(c);
    return c.json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: [...ALL_MCP_SCOPES],
      resource: mcpResourceUrl(origin),
    });
  });

  app.get("/.well-known/oauth-protected-resource", (c) => {
    const origin = publicOrigin(c);
    const resource = mcpResourceUrl(origin);
    return c.json({
      resource,
      authorization_servers: [origin],
      scopes_supported: [...ALL_MCP_SCOPES],
      bearer_methods_supported: ["header"],
    });
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (c) => {
    const origin = publicOrigin(c);
    return c.json({
      resource: mcpResourceUrl(origin),
      authorization_servers: [origin],
      scopes_supported: [...ALL_MCP_SCOPES],
      bearer_methods_supported: ["header"],
    });
  });

  // Dynamic Client Registration (RFC 7591)
  app.post("/register", async (c) => {
    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "invalid_client_metadata" }, 400);
    }

    const redirectUris = Array.isArray(body.redirect_uris)
      ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === "string")
      : [];
    if (redirectUris.length === 0 || !redirectUris.every(validateNewRedirectUri)) {
      return c.json({ error: "invalid_redirect_uri" }, 400);
    }

    const clientId = newOpaqueToken("ofcli").replace(/^ofcli_/, "ofcli_");
    const authMethod =
      typeof body.token_endpoint_auth_method === "string"
        ? body.token_endpoint_auth_method
        : "none";
    let clientSecret: string | undefined;
    let clientSecretHash: string | null = null;
    if (authMethod !== "none") {
      clientSecret = newOpaqueToken("ofcs");
      clientSecretHash = await bcrypt.hash(clientSecret, 10);
    }

    await prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash,
        clientName: typeof body.client_name === "string" ? body.client_name : null,
        redirectUris: JSON.stringify(redirectUris),
        tokenEndpointAuthMethod: authMethod === "none" ? "none" : authMethod,
      },
    });

    const res: Record<string, unknown> = {
      client_id: clientId,
      client_name: body.client_name ?? null,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod === "none" ? "none" : authMethod,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: scopesToString([...ALL_MCP_SCOPES]),
    };
    if (clientSecret) res.client_secret = clientSecret;
    return c.json(res, 201);
  });

  app.get("/authorize", async (c) => {
    if (config.auth.disabled) {
      return c.html(
        htmlPage(
          "OAuth",
          `<h1>Auth disabled</h1><p class="muted">Set AUTH_DISABLED=false to use OAuth. Use API keys or AUTH_DISABLED for local MCP.</p>`,
        ),
        400,
      );
    }

    const q = c.req.query();
    const clientId = q.client_id ?? "";
    const redirectUri = q.redirect_uri ?? "";
    const responseType = q.response_type ?? "";
    const state = q.state ?? "";
    const codeChallenge = q.code_challenge ?? "";
    const codeChallengeMethod = q.code_challenge_method ?? "S256";
    const scope = q.scope ?? "";
    const resource = q.resource ?? "";
    const error = q.error ?? "";

    if (responseType !== "code") {
      return c.html(htmlPage("OAuth", `<p class="error">unsupported_response_type</p>`), 400);
    }
    if (!clientId || !redirectUri || !codeChallenge) {
      return c.html(
        htmlPage("OAuth", `<p class="error">Missing client_id, redirect_uri, or code_challenge</p>`),
        400,
      );
    }
    if (codeChallengeMethod !== "S256") {
      return c.html(htmlPage("OAuth", `<p class="error">code_challenge_method must be S256</p>`), 400);
    }

    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
      return c.html(htmlPage("OAuth", `<p class="error">Unknown client</p>`), 400);
    }
    const uris = parseRedirectUris(client.redirectUris);
    if (!isRedirectUriAllowed(redirectUri, uris)) {
      return c.html(htmlPage("OAuth", `<p class="error">invalid_redirect_uri</p>`), 400);
    }

    const scopes = parseScopes(scope);
    const clientLabel = client.clientName || client.clientId;

    const hidden = [
      ["client_id", clientId],
      ["redirect_uri", redirectUri],
      ["state", state],
      ["code_challenge", codeChallenge],
      ["code_challenge_method", codeChallengeMethod],
      ["scope", scopesToString(scopes)],
      ["resource", resource],
    ]
      .map(([n, v]) => `<input type="hidden" name="${n}" value="${escapeHtml(v)}"/>`)
      .join("\n");

    return c.html(
      htmlPage(
        "Authorize OpenFlow",
        `<h1>Authorize MCP client</h1>
         <p class="muted"><strong>${escapeHtml(clientLabel)}</strong> wants to access your OpenFlow workflows.</p>
         <div class="scopes"><strong>Permissions</strong><ul>${scopes.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>
         ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
         <form method="post" action="/authorize">
           ${hidden}
           <label>Email</label>
           <input type="email" name="email" required autocomplete="username"/>
           <label>Password</label>
           <input type="password" name="password" required autocomplete="current-password"/>
           <button type="submit">Sign in &amp; allow</button>
         </form>`,
      ),
    );
  });

  app.post("/authorize", async (c) => {
    if (config.auth.disabled) {
      return c.json({ error: "auth_disabled" }, 400);
    }

    const contentType = c.req.header("content-type") ?? "";
    let body: Record<string, string> = {};
    if (contentType.includes("application/json")) {
      body = (await c.req.json()) as Record<string, string>;
    } else {
      const fd = await c.req.parseBody();
      for (const [k, v] of Object.entries(fd)) {
        if (typeof v === "string") body[k] = v;
      }
    }

    const clientId = body.client_id ?? "";
    const redirectUri = body.redirect_uri ?? "";
    const state = body.state ?? "";
    const codeChallenge = body.code_challenge ?? "";
    const codeChallengeMethod = body.code_challenge_method ?? "S256";
    const scopes = parseScopes(body.scope);
    const resource = body.resource || null;
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    const fail = (msg: string) => {
      const u = new URL("/authorize", publicOrigin(c));
      for (const [k, v] of Object.entries({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope: scopesToString(scopes),
        resource: resource ?? "",
        error: msg,
      })) {
        if (v) u.searchParams.set(k, v);
      }
      return c.redirect(u.toString(), 302);
    };

    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) return fail("Unknown client");
    const uris = parseRedirectUris(client.redirectUris);
    if (!isRedirectUriAllowed(redirectUri, uris)) return fail("invalid_redirect_uri");
    if (!codeChallenge || codeChallengeMethod !== "S256") return fail("invalid_request");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) return fail("Invalid credentials");
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return fail("Invalid credentials");

    await ensureUserWithProject(user.id);

    const code = await createAuthorizationCode({
      clientId,
      userId: user.id,
      redirectUri,
      scopes,
      codeChallenge,
      codeChallengeMethod,
      resource,
    });

    const dest = new URL(redirectUri);
    dest.searchParams.set("code", code);
    if (state) dest.searchParams.set("state", state);
    return c.redirect(dest.toString(), 302);
  });

  app.post("/token", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    let body: Record<string, string> = {};
    if (contentType.includes("application/json")) {
      const j = (await c.req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(j)) {
        if (typeof v === "string") body[k] = v;
      }
    } else {
      const fd = await c.req.parseBody();
      for (const [k, v] of Object.entries(fd)) {
        if (typeof v === "string") body[k] = v;
      }
    }

    // client_secret_basic
    const auth = c.req.header("authorization");
    if (auth?.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
        const i = decoded.indexOf(":");
        if (i >= 0) {
          body.client_id = body.client_id || decoded.slice(0, i);
          body.client_secret = body.client_secret || decoded.slice(i + 1);
        }
      } catch {
        /* ignore */
      }
    }

    const clientId = body.client_id ?? "";
    if (!clientId) {
      return c.json({ error: "invalid_client" }, 401);
    }
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) return c.json({ error: "invalid_client" }, 401);

    if (client.tokenEndpointAuthMethod !== "none" && client.clientSecretHash) {
      const secret = body.client_secret ?? "";
      const ok = secret && (await bcrypt.compare(secret, client.clientSecretHash));
      if (!ok) return c.json({ error: "invalid_client" }, 401);
    }

    const grantType = body.grant_type ?? "";
    if (grantType === "authorization_code") {
      const result = await exchangeAuthorizationCode({
        code: body.code ?? "",
        clientId,
        redirectUri: body.redirect_uri ?? "",
        codeVerifier: body.code_verifier ?? "",
      });
      if (!result.ok) return c.json({ error: result.error }, 400);
      return c.json({
        access_token: result.accessToken,
        token_type: "Bearer",
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
        scope: scopesToString(result.scopes),
      });
    }

    if (grantType === "refresh_token") {
      const result = await refreshAccessToken({
        refreshToken: body.refresh_token ?? "",
        clientId,
      });
      if (!result.ok) return c.json({ error: result.error }, 400);
      return c.json({
        access_token: result.accessToken,
        token_type: "Bearer",
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
        scope: scopesToString(result.scopes),
      });
    }

    return c.json({ error: "unsupported_grant_type" }, 400);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
