import type { Context } from "hono";
import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { callOpenflowTool, OPENFLOW_MCP_TOOLS } from "./tools";
import {
  createMcpSession,
  deleteMcpSession,
  getMcpSession,
  type McpSessionState,
} from "./session";
import { ALL_MCP_SCOPES } from "../oauth/scopes";
import { mcpResourceUrl, publicOrigin } from "../oauth/public-url";
import { isMcpEnabled } from "../services/instance-settings";
import { unrestrictedPolicy } from "../services/agent-policy";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function ok(id: string | number | null | undefined, result: unknown): JsonRpc {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpc {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

function resolveWorkflowIdHeader(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
}): string | null {
  return (
    c.req.header("X-OpenFlow-Workflow-Id") ||
    c.req.header("x-openflow-workflow-id") ||
    c.req.query("workflowId") ||
    null
  );
}

function toolListPayload() {
  return {
    tools: OPENFLOW_MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    })),
  };
}

async function handleRpc(
  msg: JsonRpc,
  ctx: {
    workflowId: string | null;
    userId: string;
    scopes: string[];
    session: McpSessionState | null;
    workflowPolicy: import("../services/agent-policy").WorkflowPolicy;
  },
): Promise<JsonRpc | null> {
  const id = msg.id ?? null;
  const method = msg.method ?? "";
  const params = msg.params ?? {};
  const isNotification =
    msg.id === undefined || msg.id === null;

  try {
    switch (method) {
      case "initialize":
        return ok(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "openflow", version: "1.0.0" },
          instructions:
            "OpenFlow workflow MCP — build runnable graphs end-to-end. Schema is pull-based: suggest_nodes/list_node_types discover types; get_node_type returns full properties/credentials (ALWAYS before configure). add_node creates a shell only (no parameters arg) — immediately update_node with required fields from the schema, then connect_nodes. Every runnable workflow needs a trigger (manualTrigger default). Ritual: get_workflow → trigger → per step (get_node_type → add_node → update_node → connect) → list_credentials bind by id → get_workflow audit → execute_workflow → get_execution → fix. Prefer openflow-node-base.* / openflow-node-langchain.*. Domain nodes before executeCommand. chainLlm returns {output} only — Merge combineByPosition before Code; Code has $input/$json only. Never echo secrets. Never leave bare unconfigured nodes.",
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return isNotification ? null : ok(id, {});
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, toolListPayload());
      case "tools/call": {
        const name = String((params as { name?: unknown }).name ?? "");
        const args =
          ((params as { arguments?: unknown }).arguments as Record<string, unknown>) ?? {};
        if (!name) return err(id, -32602, "Missing tool name");
        const result = await callOpenflowTool(
          {
            userId: ctx.userId,
            workflowId: ctx.workflowId,
            scopes: ctx.scopes,
            session: ctx.session,
            workflowPolicy: ctx.workflowPolicy,
          },
          name,
          args,
        );
        // MCP structuredContent must be a JSON object (not array/primitive).
        const structuredContent =
          result !== null && typeof result === "object" && !Array.isArray(result)
            ? (result as Record<string, unknown>)
            : { result };
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent,
          isError: false,
        });
      }
      default:
        if (isNotification) return null;
        return err(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (method === "tools/call") {
      return ok(id, {
        content: [{ type: "text", text: message }],
        isError: true,
      });
    }
    if (isNotification) return null;
    return err(id, -32000, message);
  }
}

async function mcpDisabled(): Promise<boolean> {
  return !(await isMcpEnabled());
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-OpenFlow-Workflow-Id, Mcp-Session-Id, MCP-Protocol-Version, Accept",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
    "Access-Control-Max-Age": "86400",
  };
}

async function handleMcp(c: Context<AppEnv>, requireWorkflowHeader: boolean) {
  if (await mcpDisabled()) {
    return c.json({ error: "MCP disabled" }, 503);
  }

  const reqOrigin = c.req.header("origin");
  const headers = corsHeaders(reqOrigin);

  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const userId = c.get("userId");
  if (!userId) {
    const origin = publicOrigin(c);
    const meta = `${origin}/.well-known/oauth-protected-resource`;
    return c.json(
      { error: "Authentication required" },
      401,
      {
        ...headers,
        "WWW-Authenticate": `Bearer realm="openflow", resource_metadata="${meta}"`,
      },
    );
  }

  const scopes = c.get("scopes") ?? [...ALL_MCP_SCOPES];
  let authKind: import("../services/agent-policy").AgentAuth["authKind"] = "session";
  try {
    authKind = c.get("authKind") ?? "session";
  } catch {
    /* unset */
  }
  const headerWf = resolveWorkflowIdHeader(c);
  const sessionHeader = c.req.header("Mcp-Session-Id") || c.req.header("mcp-session-id");

  if (c.req.method === "DELETE") {
    deleteMcpSession(sessionHeader);
    return new Response(null, { status: 204, headers });
  }

  if (c.req.method === "GET") {
    // Streamable HTTP: no long-lived SSE required; advertise server info as JSON for probes.
    const accept = c.req.header("accept") ?? "";
    if (accept.includes("text/event-stream") && !accept.includes("application/json")) {
      return c.json({ error: "SSE listen not implemented; use POST" }, 405, headers);
    }
    return c.json(
      {
        name: "openflow",
        version: "1.0.0",
        resource: mcpResourceUrl(publicOrigin(c)),
        workflowId: headerWf,
        tools: OPENFLOW_MCP_TOOLS.map((t) => t.name),
        auth: "oauth2 or X-API-Key (of_…)",
      },
      200,
      headers,
    );
  }

  if (c.req.method !== "POST") {
    return c.json({ error: "Method not allowed" }, 405, headers);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(err(null, -32700, "Parse error"), 400, headers);
  }

  const messages = Array.isArray(body) ? (body as JsonRpc[]) : [body as JsonRpc];
  const firstMethod = messages[0]?.method;

  let session = getMcpSession(sessionHeader);
  // Create session on initialize
  if (firstMethod === "initialize" && !session) {
    session = createMcpSession(userId, headerWf);
  }
  if (session && session.userId !== userId) {
    return c.json({ error: "Session user mismatch" }, 403, headers);
  }

  if (requireWorkflowHeader && !headerWf && !session?.defaultWorkflowId) {
    // Compat path still allows tools that don't need a workflow (list_workflows)
    // so we only hard-require for the legacy single-workflow alias when no session.
  }

  const workflowId = headerWf || session?.defaultWorkflowId || null;
  let workflowPolicy = unrestrictedPolicy();
  try {
    workflowPolicy = c.get("workflowPolicy") ?? unrestrictedPolicy();
  } catch {
    /* unset */
  }
  const rpcCtx = { workflowId, userId, scopes, authKind, session, workflowPolicy };

  const results: JsonRpc[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.result !== undefined || msg.error !== undefined) {
      // client JSON-RPC response — ignore
      continue;
    }

    const r = await handleRpc(msg, rpcCtx);
    if (r) results.push(r);
  }

  const outHeaders: Record<string, string> = { ...headers };
  if (session) {
    outHeaders["Mcp-Session-Id"] = session.id;
  }

  if (results.length === 0) {
    return new Response(null, { status: 202, headers: outHeaders });
  }
  if (results.length === 1) {
    return c.json(results[0], 200, outHeaders);
  }
  return c.json(results, 200, outHeaders);
}

export default function openflowMcpRoute(app: Hono<AppEnv>) {
  // Primary Streamable HTTP endpoint (multi-workflow + OAuth)
  app.all("/mcp", (c) => handleMcp(c, false));
  app.all("/mcp/", (c) => handleMcp(c, false));

  // Legacy single-workflow alias (OpenCode assistant)
  app.all("/mcp/openflow", async (c) => handleMcp(c, true));
}
