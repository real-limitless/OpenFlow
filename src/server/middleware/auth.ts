import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { getSessionUserId } from "../services/sessions";
import { ensureUser, LOCAL_USER_ID } from "../services/users";
import { config } from "../../config";
import { ALL_MCP_SCOPES } from "../oauth/scopes";
import { resolveAccessToken } from "../oauth/tokens";
import { mcpResourceUrl, publicOrigin } from "../oauth/public-url";
import {
  resolveApiKeyAuth,
  resolveOAuthAgentAuth,
  resolveTemporaryTokenAuth,
  unrestrictedPolicy,
  type AgentAuth,
  type WorkflowPolicy,
} from "../services/agent-policy";

export type AppEnv = {
  Variables: {
    userId: string;
    scopes: string[];
    authKind: AgentAuth["authKind"];
    agentId?: string;
    workflowPolicy: WorkflowPolicy;
  };
};

const EXEMPT_PATHS = [
  "/health",
  "/api/v1/auth",
  "/api/v1/setup",
  "/webhook",
  "/form",
  "/.well-known",
  "/authorize",
  "/register",
  "/token",
];

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.some((ep) => path === ep || path.startsWith(ep + "/"));
}

function isMcpPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/mcp/");
}

function isPublicTemplateGet(method: string, path: string): boolean {
  if (method !== "GET") return false;
  if (path === "/api/v1/templates" || path === "/api/v1/templates/facets") return true;
  if (path === "/api/v1/template-sources/status") return true;
  const m = path.match(/^\/api\/v1\/templates\/([^/]+)(?:\/workflow)?$/);
  if (!m) return false;
  return m[1] !== "import";
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

function applyAgent(c: Context<AppEnv>, auth: AgentAuth) {
  c.set("userId", auth.userId);
  c.set("scopes", auth.scopes);
  c.set("authKind", auth.authKind);
  if (auth.agentId) c.set("agentId", auth.agentId);
  c.set("workflowPolicy", auth.workflowPolicy);
}

function sessionAuth(userId: string): AgentAuth {
  return {
    userId,
    scopes: [...ALL_MCP_SCOPES],
    authKind: "session",
    workflowPolicy: unrestrictedPolicy(),
  };
}

function unauthorizedMcp(c: Context<AppEnv>) {
  const origin = publicOrigin(c);
  const meta = `${origin}/.well-known/oauth-protected-resource`;
  return c.json(
    { error: "Authentication required" },
    401,
    {
      "WWW-Authenticate": `Bearer realm="openflow", resource_metadata="${meta}", scope="${ALL_MCP_SCOPES.join(" ")}"`,
      "Access-Control-Expose-Headers": "WWW-Authenticate",
    },
  );
}

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  if (c.req.method === "OPTIONS") {
    return next();
  }

  if (config.auth.disabled) {
    await ensureUser(LOCAL_USER_ID);
    applyAgent(c, {
      userId: LOCAL_USER_ID,
      scopes: [...ALL_MCP_SCOPES],
      authKind: "disabled",
      workflowPolicy: unrestrictedPolicy(),
    });
    return next();
  }

  const path = new URL(c.req.url).pathname;
  if (isExempt(path)) {
    return next();
  }
  if (isPublicTemplateGet(c.req.method, path)) {
    const token = getCookie(c, "session");
    const sessionUser = await getSessionUserId(token);
    if (sessionUser) applyAgent(c, sessionAuth(sessionUser));
    return next();
  }

  const xApiKey = c.req.header("X-API-Key");
  if (xApiKey) {
    const raw = xApiKey.startsWith("Bearer ") ? xApiKey.slice(7) : xApiKey;
    const auth = await resolveApiKeyAuth(raw);
    if (auth) {
      applyAgent(c, auth);
      return next();
    }
  }

  const bearer = extractBearer(c.req.header("Authorization"));
  if (bearer) {
    if (bearer.startsWith("of_")) {
      const auth = await resolveApiKeyAuth(bearer);
      if (auth) {
        applyAgent(c, auth);
        return next();
      }
    }
    if (bearer.startsWith("oft_")) {
      const auth = await resolveTemporaryTokenAuth(bearer);
      if (auth) {
        applyAgent(c, auth);
        return next();
      }
    }
    if (bearer.startsWith("ofa_")) {
      const resolved = await resolveAccessToken(bearer);
      if (resolved) {
        const auth = await resolveOAuthAgentAuth(
          resolved.userId,
          resolved.scopes,
          resolved.tokenId,
        );
        applyAgent(c, auth);
        return next();
      }
    }
  }

  const token = getCookie(c, "session");
  const userId = await getSessionUserId(token);
  if (!userId) {
    if (isMcpPath(path)) {
      return unauthorizedMcp(c);
    }
    return c.json({ error: "Authentication required" }, 401);
  }

  applyAgent(c, sessionAuth(userId));
  return next();
}

export function getWorkflowPolicy(c: Context<AppEnv>): WorkflowPolicy {
  try {
    return c.get("workflowPolicy") ?? unrestrictedPolicy();
  } catch {
    return unrestrictedPolicy();
  }
}
