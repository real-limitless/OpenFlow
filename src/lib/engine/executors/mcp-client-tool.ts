import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_TIMEOUT = 60000;

export type McpTransport = "sse" | "httpStreamable";

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: string;
  isError?: boolean;
  raw?: unknown;
}

export interface McpClientToolHandle {
  type: "@n8n/n8n-nodes-langchain.mcpClientTool";
  endpoint: string;
  transport: McpTransport;
  tools: McpToolDescriptor[];
  timeoutMs: number;
  invoke(toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
}

export type McpHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: McpHttpClient | null = null;

export function setMcpHttpClient(factory: McpHttpClient | null): void {
  httpOverride = factory;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

let rpcId = 0;

function nextId(): number {
  rpcId += 1;
  return rpcId;
}

function resolveStringParam(
  ctx: ExecutionContext,
  name: string,
): string {
  const raw = ctx.getParam<unknown>(name);
  if (raw == null) return "";
  const str = String(raw);
  if (str.startsWith("=")) {
    const items = ctx.getInputItems(0);
    const firstJson = items[0]?.json ?? {};
    const resolved = ctx.evaluate(str, firstJson);
    return resolved != null ? String(resolved) : "";
  }
  return str;
}

function resolveTransport(
  serverTransport: unknown,
  endpointUrl: string,
  sseEndpoint: string,
): McpTransport {
  if (typeof serverTransport === "string" && serverTransport.length > 0) {
    const t = serverTransport.toLowerCase();
    if (t === "httpstreamable" || t === "streamable_http" || t === "streamablehttp") {
      return "httpStreamable";
    }
    if (t === "sse") {
      return "sse";
    }
    throw new Error(`MCP Client Tool: unknown serverTransport "${serverTransport}"`);
  }
  if (endpointUrl) return "httpStreamable";
  if (sseEndpoint) return "sse";
  return "httpStreamable";
}

async function resolveAuthHeadersAsync(
  ctx: ExecutionContext,
  authentication: string,
): Promise<Record<string, string>> {
  if (!authentication || authentication === "none") return {};

  if (authentication === "bearerAuth") {
    const cred = await ctx.getCredential("httpBearerAuth");
    if (!cred) {
      throw new Error('MCP Client Tool: credential "httpBearerAuth" is required for bearerAuth');
    }
    const token = String(cred.token ?? "");
    if (!token) {
      throw new Error("MCP Client Tool: httpBearerAuth credential is missing token");
    }
    return { authorization: `Bearer ${token}` };
  }

  if (authentication === "headerAuth") {
    const cred = await ctx.getCredential("httpHeaderAuth");
    if (!cred) {
      throw new Error('MCP Client Tool: credential "httpHeaderAuth" is required for headerAuth');
    }
    const headerName = String(cred.name ?? "X-API-Key");
    const headerValue = String(cred.value ?? "");
    if (!headerValue) {
      throw new Error("MCP Client Tool: httpHeaderAuth credential is missing value");
    }
    return { [headerName]: headerValue };
  }

  if (authentication === "multipleHeadersAuth") {
    // Imported n8n workflows often use httpMultipleHeadersAuth; OpenFlow also
    // accepts httpCustomAuth as an alias.
    const cred =
      (await ctx.getCredential("httpMultipleHeadersAuth")) ??
      (await ctx.getCredential("httpCustomAuth"));
    if (!cred) return {};
    const headers: Record<string, string> = {};
    const raw = cred.headers;
    if (Array.isArray(raw)) {
      for (const p of raw as Array<{ name?: string; value?: string }>) {
        if (p.name) headers[p.name] = String(p.value ?? "");
      }
    } else if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        headers[k] = String(v ?? "");
      }
    }
    return headers;
  }

  if (authentication === "oAuth2Api" || authentication === "oAuth2") {
    const cred = await ctx.getCredential("oAuth2Api");
    if (!cred) return {};
    const accessToken = String(cred.accessToken ?? "");
    if (accessToken) return { authorization: `Bearer ${accessToken}` };
    return {};
  }

  return {};
}

function filterTools(
  tools: McpToolDescriptor[],
  include: string,
  includeTools: string[],
  excludeTools: string[],
): McpToolDescriptor[] {
  if (include === "selected") {
    const want = new Set(includeTools.map((t) => String(t)));
    const filtered = tools.filter((t) => want.has(t.name));
    if (filtered.length === 0) {
      throw new Error(
        "MCP Client Tool: include is 'selected' but no requested tools were found on the server",
      );
    }
    return filtered;
  }

  if (include === "allExcept") {
    const exclude = new Set(excludeTools.map((t) => String(t)));
    return tools.filter((t) => !exclude.has(t.name));
  }

  return tools;
}

function mapCallResult(result: unknown): McpToolCallResult {
  const r = result as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  } | null;

  const parts = r?.content ?? [];
  const textParts: string[] = [];
  const otherParts: unknown[] = [];

  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      textParts.push(part.text);
    } else {
      otherParts.push(part);
    }
  }

  let content = textParts.join("");
  if (otherParts.length > 0) {
    const summary = JSON.stringify(otherParts);
    content = content ? `${content}\n${summary}` : summary;
  }

  return {
    content,
    isError: r?.isError === true,
    raw: result,
  };
}

async function mcpRpcCall(
  endpoint: string,
  transport: McpTransport,
  method: string,
  params: Record<string, unknown> | undefined,
  authHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const http = httpOverride ?? sdkHttpRequest;
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextId(),
    method,
  };
  if (params) req.params = params;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: transport === "sse" ? "text/event-stream, application/json" : "application/json",
    ...authHeaders,
  };

  const res = await http({
    method: "POST",
    url: endpoint,
    headers,
    body: req,
    timeoutMs,
  });

  if (res.status < 200 || res.status >= 300) {
    const bodyStr = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
    throw new Error(`MCP Client Tool: ${method} failed (HTTP ${res.status}): ${bodyStr}`);
  }

  const body = res.body as JsonRpcResponse | string;
  let parsed: JsonRpcResponse;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body) as JsonRpcResponse;
    } catch {
      throw new Error(`MCP Client Tool: ${method} returned non-JSON response`);
    }
  } else {
    parsed = body ?? {};
  }

  if (parsed.error) {
    throw new Error(
      `MCP Client Tool: ${method} RPC error (${parsed.error.code}): ${parsed.error.message}`,
    );
  }

  return parsed.result;
}

async function listTools(
  endpoint: string,
  transport: McpTransport,
  authHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<McpToolDescriptor[]> {
  const all: McpToolDescriptor[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 100; page++) {
    const params: Record<string, unknown> = {};
    if (cursor) params.cursor = cursor;

    const result = await mcpRpcCall(
      endpoint,
      transport,
      "tools/list",
      params,
      authHeaders,
      timeoutMs,
    );

    const r = result as {
      tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
      nextCursor?: string;
    } | null;

    const tools = r?.tools ?? [];
    for (const t of tools) {
      all.push({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      });
    }

    cursor = r?.nextCursor;
    if (!cursor) break;
  }

  return all;
}

export const mcpClientToolExecutor: NodeExecutor = async (ctx) => {
  const endpointUrl = resolveStringParam(ctx, "endpointUrl");
  const sseEndpoint = resolveStringParam(ctx, "sseEndpoint");

  const endpoint = endpointUrl || sseEndpoint;
  if (!endpoint) {
    throw new Error("MCP Client Tool: an MCP endpoint is required (endpointUrl or sseEndpoint)");
  }

  const serverTransportRaw = ctx.getParam<unknown>("serverTransport");
  const transport = resolveTransport(serverTransportRaw, endpointUrl, sseEndpoint);

  const authenticationRaw = ctx.getParam<unknown>("authentication", "none");
  const authentication = typeof authenticationRaw === "string" ? authenticationRaw : "none";

  const authHeaders = await resolveAuthHeadersAsync(ctx, authentication);

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = typeof options.timeout === "number" ? options.timeout : DEFAULT_TIMEOUT;

  const tools = await listTools(endpoint, transport, authHeaders, timeoutMs);

  const includeRaw = ctx.getParam<unknown>("include", "all");
  const include = typeof includeRaw === "string" ? includeRaw : "all";
  const includeTools = (ctx.getParam<unknown[]>("includeTools", []) ?? []).map((t) => String(t));
  const excludeTools = (ctx.getParam<unknown[]>("excludeTools", []) ?? []).map((t) => String(t));

  const exposedTools = filterTools(tools, include, includeTools, excludeTools);

  const handle: McpClientToolHandle = {
    type: "@n8n/n8n-nodes-langchain.mcpClientTool",
    endpoint,
    transport,
    tools: exposedTools,
    timeoutMs,
    async invoke(toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
      const result = await mcpRpcCall(
        endpoint,
        transport,
        "tools/call",
        { name: toolName, arguments: args },
        authHeaders,
        timeoutMs,
      );
      return mapCallResult(result);
    },
  };

  const items = ctx.getInputItems(0);
  const pairedItem =
    items.length > 0 ? (items[0].pairedItem ?? { item: 0, input: 0 }) : { item: 0, input: 0 };

  const output: INodeExecutionData = {
    json: handle as unknown as Record<string, unknown>,
    pairedItem,
  };

  return [[output]];
};