import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { callOpenflowTool, OPENFLOW_MCP_TOOLS } from "./tools";
import { config } from "../../config";

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

function resolveWorkflowId(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
}): string | null {
  return (
    c.req.header("X-OpenFlow-Workflow-Id") ||
    c.req.header("x-openflow-workflow-id") ||
    c.req.query("workflowId") ||
    null
  );
}

async function handleRpc(
  msg: JsonRpc,
  ctx: { workflowId: string; userId: string },
): Promise<JsonRpc> {
  const id = msg.id ?? null;
  const method = msg.method ?? "";
  const params = msg.params ?? {};

  try {
    switch (method) {
      case "initialize":
        return ok(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "openflow", version: "0.1.0" },
        });
      case "notifications/initialized":
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, {
          tools: OPENFLOW_MCP_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
      case "tools/call": {
        const name = String((params as { name?: unknown }).name ?? "");
        const args =
          ((params as { arguments?: unknown }).arguments as Record<string, unknown>) ?? {};
        if (!name) return err(id, -32602, "Missing tool name");
        const result = await callOpenflowTool(ctx.workflowId, ctx.userId, name, args);
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          isError: false,
        });
      }
      default:
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
    return err(id, -32000, message);
  }
}

export default function openflowMcpRoute(app: Hono<AppEnv>) {
  app.all("/mcp/openflow", async (c) => {
    if (!config.assistant.enabled) {
      return c.json({ error: "Assistant disabled" }, 503);
    }

    const workflowId = resolveWorkflowId(c);
    if (!workflowId) {
      return c.json({ error: "X-OpenFlow-Workflow-Id header or workflowId query required" }, 400);
    }

    const userId = c.get("userId") ?? "local";

    if (c.req.method === "GET") {
      return c.json({
        name: "openflow",
        version: "0.1.0",
        workflowId,
        tools: OPENFLOW_MCP_TOOLS.map((t) => t.name),
      });
    }

    if (c.req.method !== "POST") {
      return c.json({ error: "Method not allowed" }, 405);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(err(null, -32700, "Parse error"), 400);
    }

    const messages = Array.isArray(body) ? body : [body];
    const results: JsonRpc[] = [];
    for (const msg of messages as JsonRpc[]) {
      if (!msg || typeof msg !== "object") continue;
      // notifications without id
      if (
        msg.method &&
        (msg.id === undefined || msg.id === null) &&
        msg.method.startsWith("notifications/")
      ) {
        await handleRpc(msg, { workflowId, userId });
        continue;
      }
      results.push(await handleRpc(msg, { workflowId, userId }));
    }

    if (results.length === 0) return c.body(null, 204);
    if (results.length === 1) return c.json(results[0]);
    return c.json(results);
  });
}
