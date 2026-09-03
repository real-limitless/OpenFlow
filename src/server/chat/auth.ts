import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { getSessionUserId } from "../services/sessions";
import { config } from "../../config";
import { resolveCredential } from "../credentials";
import type { INode } from "../../lib/workflow/types";
import type { AppEnv } from "../middleware/auth";

export function applyChatCors(
  c: Context<AppEnv>,
  allowedOrigins: string,
): void {
  const origin = c.req.header("Origin");
  const allowed = allowedOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const star = allowed.includes("*") || allowed.length === 0;
  if (star) {
    c.header("Access-Control-Allow-Origin", origin || "*");
  } else if (origin && allowed.includes(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
  }
  c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Vary", "Origin");
}

export async function authorizeChatRequest(
  c: Context<AppEnv>,
  node: INode,
  authentication: string,
  workflowRow: { userId: string; projectId: string },
): Promise<{ ok: true } | { ok: false; status: 401; message: string }> {
  if (authentication === "none" || !authentication) {
    return { ok: true };
  }

  if (authentication === "n8nUserAuth") {
    if (config.auth.disabled) return { ok: true };
    const token = getCookie(c, "session");
    const userId = await getSessionUserId(token);
    if (!userId) {
      return { ok: false, status: 401, message: "Authentication required" };
    }
    return { ok: true };
  }

  if (authentication === "basicAuth") {
    const header = c.req.header("Authorization") ?? "";
    if (!header.startsWith("Basic ")) {
      c.header("WWW-Authenticate", 'Basic realm="OpenFlow Chat"');
      return { ok: false, status: 401, message: "Basic authentication required" };
    }
    let user = "";
    let password = "";
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      user = idx >= 0 ? decoded.slice(0, idx) : decoded;
      password = idx >= 0 ? decoded.slice(idx + 1) : "";
    } catch {
      return { ok: false, status: 401, message: "Invalid basic authentication" };
    }
    const ref = node.credentials?.httpBasicAuth;
    if (!ref) {
      return { ok: false, status: 401, message: "Chat is missing a Basic Auth credential" };
    }
    const cred = await resolveCredential(ref, {
      userId: workflowRow.userId,
      projectId: workflowRow.projectId,
    });
    const expectedUser = String((cred as { user?: unknown } | null)?.user ?? "");
    const expectedPass = String((cred as { password?: unknown } | null)?.password ?? "");
    if (!cred || user !== expectedUser || password !== expectedPass) {
      c.header("WWW-Authenticate", 'Basic realm="OpenFlow Chat"');
      return { ok: false, status: 401, message: "Invalid credentials" };
    }
    return { ok: true };
  }

  return { ok: true };
}
