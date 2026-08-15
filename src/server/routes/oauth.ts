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
import { editorListWorkflows } from "../services/workflow-access";
import { normalizeGrantInputs, type WorkflowGrant } from "../services/agent-policy";
import { randomBytes } from "node:crypto";

type PendingConsent = {
  userId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopes: string[];
  resource: string | null;
  expiresAt: number;
};

const pendingConsents = new Map<string, PendingConsent>();

function prunePending() {
  const now = Date.now();
  for (const [k, v] of pendingConsents) {
    if (v.expiresAt < now) pendingConsents.delete(k);
  }
}

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
         <p class="muted"><strong>${escapeHtml(clientLabel)}</strong> wants to access selected workflows via MCP.</p>
         <div class="scopes"><strong>Capability scopes</strong><ul>${scopes.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>
         ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
         <form method="post" action="/authorize">
           ${hidden}
           <label>Email</label>
           <input type="email" name="email" required autocomplete="username"/>
           <label>Password</label>
           <input type="password" name="password" required autocomplete="current-password"/>
           <button type="submit">Continue</button>
         </form>`,
      ),
    );
  });

  app.post("/authorize", async (c) => {
    if (config.auth.disabled) {
      return c.json({ error: "auth_disabled" }, 400);
    }

    const contentType = c.req.header("content-type") ?? "";
    let body: Record<string, string | string[]> = {};
    if (contentType.includes("application/json")) {
      body = (await c.req.json()) as Record<string, string | string[]>;
    } else {
      const fd = await c.req.parseBody();
      for (const [k, v] of Object.entries(fd)) {
        if (typeof v === "string") body[k] = v;
        else if (Array.isArray(v)) body[k] = v.filter((x): x is string => typeof x === "string");
      }
    }

    const str = (k: string) => {
      const v = body[k];
      return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
    };

    // Step 2: pending consent + workflow selection
    const pendingId = str("pending_id");
    if (pendingId) {
      prunePending();
      const pending = pendingConsents.get(pendingId);
      if (!pending || pending.expiresAt < Date.now()) {
        return c.html(htmlPage("OAuth", `<p class="error">Consent session expired. Start again.</p>`), 400);
      }
      pendingConsents.delete(pendingId);

      const selected = body["workflow_id"];
      const ids = Array.isArray(selected)
        ? selected
        : typeof selected === "string" && selected
          ? [selected]
          : [];
      if (ids.length === 0) {
        return c.html(
          htmlPage("OAuth", `<p class="error">Select at least one workflow.</p>`),
          400,
        );
      }

      const grants: WorkflowGrant[] = [];
      for (const workflowId of ids) {
        const canWrite = str(`w_${workflowId}`) === "on" || str(`w_${workflowId}`) === "1";
        const canExecute = str(`x_${workflowId}`) === "on" || str(`x_${workflowId}`) === "1";
        const canRead = true;
        grants.push(
          ...normalizeGrantInputs([{ workflowId, canRead, canWrite, canExecute }]),
        );
      }

      const code = await createAuthorizationCode({
        clientId: pending.clientId,
        userId: pending.userId,
        redirectUri: pending.redirectUri,
        scopes: pending.scopes,
        codeChallenge: pending.codeChallenge,
        codeChallengeMethod: pending.codeChallengeMethod,
        resource: pending.resource,
        workflowGrants: grants,
      });

      const dest = new URL(pending.redirectUri);
      dest.searchParams.set("code", code);
      if (pending.state) dest.searchParams.set("state", pending.state);
      return c.redirect(dest.toString(), 302);
    }

    const clientId = str("client_id");
    const redirectUri = str("redirect_uri");
    const state = str("state");
    const codeChallenge = str("code_challenge");
    const codeChallengeMethod = str("code_challenge_method") || "S256";
    const scopes = parseScopes(str("scope"));
    const resource = str("resource") || null;
    const email = str("email").trim().toLowerCase();
    const password = str("password");

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

    const listed = await editorListWorkflows(user.id, { limit: 100 });
    prunePending();
    const pid = randomBytes(16).toString("hex");
    pendingConsents.set(pid, {
      userId: user.id,
      clientId,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      scopes,
      resource,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const rows =
      listed.items.length === 0
        ? `<p class="muted">You have no workflows. Create one in OpenFlow first.</p>`
        : listed.items
            .map(
              (w) => `<label class="wf">
                <input type="checkbox" name="workflow_id" value="${escapeHtml(w.id)}" checked/>
                <span>${escapeHtml(w.name)}</span>
                <span class="perms">
                  <label><input type="checkbox" name="w_${escapeHtml(w.id)}" checked/> edit</label>
                  <label><input type="checkbox" name="x_${escapeHtml(w.id)}" checked/> run</label>
                </span>
              </label>`,
            )
            .join("\n");

    return c.html(
      htmlPage(
        "Select workflows",
        `<h1>Select workflows</h1>
         <p class="muted">Choose which workflows this MCP client may access. Uncheck edit/run to grant read-only.</p>
         <form method="post" action="/authorize">
           <input type="hidden" name="pending_id" value="${escapeHtml(pid)}"/>
           <div class="wf-list">${rows}</div>
           <button type="submit" ${listed.items.length === 0 ? "disabled" : ""}>Allow access</button>
         </form>
         <style>
           .wf-list { display:flex; flex-direction:column; gap:0.5rem; margin:1rem 0; max-height:320px; overflow:auto; }
           .wf { display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem; font-size:0.9rem; padding:0.4rem; border-radius:6px; background:#8881; }
           .wf .perms { margin-left:auto; display:flex; gap:0.75rem; font-size:0.8rem; opacity:0.9; }
         </style>`,
      ),
    );
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
