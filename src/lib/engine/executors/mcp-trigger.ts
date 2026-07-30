import type { NodeExecutor, INodeExecutionData } from "@/sdk";

export interface McpTriggerTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpTriggerToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface McpCallRequest {
  method?: unknown;
  params?: { name?: unknown; arguments?: unknown };
  name?: unknown;
  arguments?: unknown;
}

function parseSchema(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function getMcpTriggerTools(
  parameters: Record<string, unknown>,
): McpTriggerTool[] {
  const toolsParam = parameters.tools as
    | { values?: Array<Record<string, unknown>> }
    | Array<Record<string, unknown>>
    | undefined;

  let entries: Array<Record<string, unknown>> = [];
  if (Array.isArray(toolsParam)) {
    entries = toolsParam;
  } else if (toolsParam && Array.isArray(toolsParam.values)) {
    entries = toolsParam.values;
  }

  const out: McpTriggerTool[] = [];
  for (const entry of entries) {
    const name = String(entry.name ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      description: entry.description != null ? String(entry.description) : undefined,
      inputSchema: parseSchema(entry.schema ?? entry.inputSchema),
    });
  }
  return out;
}

export function shapeMcpToolResult(
  items: INodeExecutionData[],
): McpTriggerToolResult {
  if (items.length === 0) {
    return { content: [{ type: "text", text: "" }], isError: false };
  }

  const json = (items[0].json ?? {}) as Record<string, unknown>;

  if (Array.isArray(json.content)) {
    return {
      content: json.content as Array<{ type: string; text?: string }>,
      isError: json.isError === true,
    };
  }

  const isError = json.isError === true || json.error != null;

  let text: string;
  if (typeof json.output === "string") {
    text = json.output;
  } else if (typeof json.text === "string") {
    text = json.text;
  } else if (json.error != null) {
    text = String(json.error);
  } else {
    try {
      text = JSON.stringify(json);
    } catch {
      text = String(json);
    }
  }

  return { content: [{ type: "text", text }], isError };
}

export const mcpTriggerExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const configuredTools = getMcpTriggerTools(node.parameters);
  const knownNames = new Set(configuredTools.map((t) => t.name));
  const continueOnFail = ctx.continueOnFail();

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const req = (item.json ?? {}) as McpCallRequest;
    const params = req.params ?? {};
    const toolName = String(params.name ?? req.name ?? "").trim();

    if (!toolName) {
      const msg = "MCP Trigger: tools/call request is missing tool name";
      if (continueOnFail) {
        out.push({ json: { error: msg } });
        continue;
      }
      throw new Error(msg);
    }

    if (knownNames.size > 0 && !knownNames.has(toolName)) {
      const msg = `MCP Trigger: unknown tool '${toolName}'`;
      if (continueOnFail) {
        out.push({ json: { error: msg } });
        continue;
      }
      throw new Error(msg);
    }

    const args = (params.arguments ?? req.arguments) as Record<string, unknown>;
    const json: Record<string, unknown> = {
      toolName,
      arguments: args ?? {},
      method: String(req.method ?? "tools/call"),
    };

    out.push({ json, binary: item.binary });
  }

  return [out];
};