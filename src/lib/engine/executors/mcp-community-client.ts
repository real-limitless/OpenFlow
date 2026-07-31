import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";
import { spawn, type ChildProcess } from "node:child_process";

export type McpCommunityTransport = "stdio" | "sse" | "httpStreamable";
export type McpCommunityOperation =
  "listTools" | "executeTool" | "listResources" | "readResource" | "listPrompts" | "getPrompt";

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

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export type McpHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: McpHttpClient | null = null;

export function setMcpCommunityHttpClient(client: McpHttpClient | null): void {
  httpOverride = client;
}

interface TransportLike {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

function resolveStringParam(ctx: ExecutionContext, name: string): string {
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

function parseKeyValue(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\n|,|(?:\s+)/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sepIdx = trimmed.indexOf("=");
    if (sepIdx > 0) {
      const key = trimmed.slice(0, sepIdx).trim();
      const value = trimmed.slice(sepIdx + 1).trim();
      if (key) result[key] = value;
    }
  }
  return result;
}

function parseHeaders(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sepIdx = trimmed.indexOf(":");
    if (sepIdx > 0) {
      const key = trimmed.slice(0, sepIdx).trim();
      const value = trimmed.slice(sepIdx + 1).trim();
      if (key) result[key] = value;
    }
  }
  return result;
}

function buildHttpTransport(
  endpoint: string,
  authHeaders: Record<string, string>,
  transport: McpCommunityTransport,
  timeoutMs: number,
): TransportLike {
  const http = httpOverride ?? sdkHttpRequest;

  async function request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const req: JsonRpcRequest = { jsonrpc: "2.0", id: nextId(), method };
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
      throw new Error(`MCP Client: ${method} failed (HTTP ${res.status}): ${bodyStr}`);
    }

    const body = res.body as JsonRpcResponse | string;
    let parsed: JsonRpcResponse;
    if (typeof body === "string") {
      try {
        parsed = JSON.parse(body) as JsonRpcResponse;
      } catch {
        throw new Error(`MCP Client: ${method} returned non-JSON response`);
      }
    } else {
      parsed = body ?? {};
    }

    if (parsed.error) {
      throw new Error(
        `MCP Client: ${method} RPC error (${parsed.error.code}): ${parsed.error.message}`,
      );
    }

    return parsed.result;
  }

  return { request, close() {} };
}

function buildStdioTransport(
  command: string,
  args: string,
  envVars: Record<string, string>,
): TransportLike {
  const argList = args ? args.split(/\s+/).filter((s) => s.length > 0) : [];
  const env = { ...process.env, ...envVars };

  let proc: ChildProcess | null = spawn(command, argList, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<number, PendingRpc>();
  let buffer = "";
  let closed = false;

  if (!proc.pid && !proc.killed) {
    throw new Error(`MCP Client: failed to spawn "${command}"`);
  }

  const stdout = proc.stdout;
  if (stdout) {
    stdout.setEncoding("utf-8");
    stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcResponse;
          if (typeof msg.id === "number" && pending.has(msg.id)) {
            const entry = pending.get(msg.id)!;
            pending.delete(msg.id);
            if (msg.error) {
              entry.reject(new Error(`MCP Client: ${msg.error.message} (code ${msg.error.code})`));
            } else {
              entry.resolve(msg.result);
            }
          }
        } catch {
          /* skip non-JSON stdout lines */
        }
      }
    });
  }

  if (proc.stderr) {
    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", () => {});
  }

  proc.on("close", (code) => {
    closed = true;
    for (const entry of pending.values()) {
      entry.reject(new Error(`MCP Client: server process exited with code ${code}`));
    }
    pending.clear();
  });

  proc.on("error", (err) => {
    closed = true;
    for (const entry of pending.values()) {
      entry.reject(new Error(`MCP Client: server process error: ${err.message}`));
    }
    pending.clear();
  });

  return {
    request(method: string, params?: Record<string, unknown>): Promise<unknown> {
      const id = nextId();
      const req: JsonRpcRequest = { jsonrpc: "2.0", id, method };
      if (params) req.params = params;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        if (proc && proc.stdin && !closed) {
          proc.stdin.write(JSON.stringify(req) + "\n", (writeErr) => {
            if (writeErr) {
              pending.delete(id);
              reject(writeErr);
            }
          });
        } else {
          pending.delete(id);
          reject(new Error("MCP Client: server process not available"));
        }
      });
    },
    close() {
      if (proc) {
        proc.kill();
        proc = null;
      }
    },
  };
}

async function paginatedList<T>(
  transport: TransportLike,
  method: string,
  key: string,
  mapFn: (item: unknown) => T,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const params: Record<string, unknown> = {};
    if (cursor) params.cursor = cursor;
    const result = (await transport.request(method, params)) as Record<string, unknown> | null;
    const items = (result?.[key] as unknown[]) ?? [];
    for (const it of items) {
      all.push(mapFn(it));
    }
    cursor = result?.nextCursor as string | undefined;
    if (!cursor) break;
  }
  return all;
}

async function executeOperation(
  transport: TransportLike,
  operation: McpCommunityOperation,
  toolName: string,
  toolParameters: Record<string, unknown>,
  promptName: string,
  resourceUri: string,
): Promise<INodeExecutionData[]> {
  switch (operation) {
    case "listTools": {
      const tools = await paginatedList(transport, "tools/list", "tools", (item: unknown) => {
        const t = item as { name?: string; description?: string; inputSchema?: unknown };
        return { name: t.name ?? "", description: t.description, inputSchema: t.inputSchema };
      });
      return tools.map((t) => ({ json: t as unknown as Record<string, unknown> }));
    }

    case "executeTool": {
      if (!toolName) {
        throw new Error("MCP Client: toolName is required for executeTool operation");
      }
      const params = { name: toolName, arguments: toolParameters };
      const result = (await transport.request("tools/call", params)) as Record<
        string,
        unknown
      > | null;
      return [{ json: (result ?? {}) as Record<string, unknown> }];
    }

    case "listResources": {
      const resources = await paginatedList(
        transport,
        "resources/list",
        "resources",
        (item: unknown) => {
          const r = item as {
            uri?: string;
            name?: string;
            description?: string;
            mimeType?: string;
          };
          return {
            uri: r.uri ?? "",
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          };
        },
      );
      return resources.map((r) => ({ json: r as unknown as Record<string, unknown> }));
    }

    case "readResource": {
      if (!resourceUri) {
        throw new Error("MCP Client: resourceUri is required for readResource operation");
      }
      const result = (await transport.request("resources/read", { uri: resourceUri })) as Record<
        string,
        unknown
      > | null;
      return [{ json: (result ?? {}) as Record<string, unknown> }];
    }

    case "listPrompts": {
      const prompts = await paginatedList(transport, "prompts/list", "prompts", (item: unknown) => {
        const p = item as { name?: string; description?: string; arguments?: unknown };
        return { name: p.name ?? "", description: p.description, arguments: p.arguments };
      });
      return prompts.map((p) => ({ json: p as unknown as Record<string, unknown> }));
    }

    case "getPrompt": {
      if (!promptName) {
        throw new Error("MCP Client: promptName is required for getPrompt operation");
      }
      const result = (await transport.request("prompts/get", { name: promptName })) as Record<
        string,
        unknown
      > | null;
      return [{ json: (result ?? {}) as Record<string, unknown> }];
    }

    default:
      throw new Error(`MCP Client: unknown operation "${operation}"`);
  }
}

export const mcpCommunityClientExecutor: NodeExecutor = async (ctx) => {
  const operation = ctx.getParam<McpCommunityOperation>("operation", "listTools");
  const connectionType = ctx.getParam<McpCommunityTransport>("connectionType", "httpStreamable");

  let transport: TransportLike | null = null;
  let error: Error | null = null;

  try {
    if (connectionType === "stdio") {
      const cred = await ctx.getCredential("mcpClientApi");
      if (!cred) {
        throw new Error('MCP Client: credential "mcpClientApi" is required for STDIO transport');
      }
      const command = String(cred.command ?? "");
      if (!command) {
        throw new Error("MCP Client: STDIO credential is missing command");
      }
      const args = String(cred.arguments ?? "");
      const envText = String(cred.environmentVariables ?? "");
      const envVars = envText ? parseKeyValue(envText) : {};
      transport = buildStdioTransport(command, args, envVars);
    } else if (connectionType === "sse") {
      const cred = await ctx.getCredential("mcpClientSseApi");
      if (!cred) {
        throw new Error('MCP Client: credential "mcpClientSseApi" is required for SSE transport');
      }
      const sseUrl = String(cred.sseUrl ?? "");
      if (!sseUrl) {
        throw new Error("MCP Client: SSE credential is missing sseUrl");
      }
      const messagesPostEndpoint = String(cred.messagesPostEndpoint ?? "");
      const endpoint = messagesPostEndpoint || sseUrl;
      const headerText = String(cred.additionalHeaders ?? "");
      const authHeaders = headerText ? parseHeaders(headerText) : {};
      transport = buildHttpTransport(endpoint, authHeaders, "sse", 60000);
    } else {
      const cred = await ctx.getCredential("mcpClientHttpApi");
      if (!cred) {
        throw new Error(
          'MCP Client: credential "mcpClientHttpApi" is required for HTTP Streamable transport',
        );
      }
      const httpStreamableUrl = String(cred.httpStreamableUrl ?? "");
      if (!httpStreamableUrl) {
        throw new Error("MCP Client: HTTP Streamable credential is missing httpStreamableUrl");
      }
      const headerText = String(cred.additionalHeaders ?? "");
      const authHeaders = headerText ? parseHeaders(headerText) : {};
      transport = buildHttpTransport(httpStreamableUrl, authHeaders, "httpStreamable", 60000);
    }

    const toolName = resolveStringParam(ctx, "toolName");
    const toolParamsRaw = ctx.getParam<unknown>("toolParameters", "{}");
    let toolParameters: Record<string, unknown>;
    if (typeof toolParamsRaw === "object" && toolParamsRaw !== null) {
      toolParameters = toolParamsRaw as Record<string, unknown>;
    } else if (typeof toolParamsRaw === "string") {
      if (toolParamsRaw.startsWith("=")) {
        const items = ctx.getInputItems(0);
        const firstJson = items[0]?.json ?? {};
        const resolved = ctx.evaluate(toolParamsRaw, firstJson);
        if (typeof resolved === "object" && resolved !== null) {
          toolParameters = resolved as Record<string, unknown>;
        } else if (typeof resolved === "string") {
          try {
            toolParameters = JSON.parse(resolved);
          } catch {
            toolParameters = {};
          }
        } else {
          toolParameters = {};
        }
      } else {
        try {
          toolParameters = JSON.parse(toolParamsRaw);
        } catch {
          toolParameters = {};
        }
      }
    } else {
      toolParameters = {};
    }
    const promptName = resolveStringParam(ctx, "promptName");
    const resourceUri = resolveStringParam(ctx, "resourceUri");

    const output = await executeOperation(
      transport,
      operation,
      toolName,
      toolParameters,
      promptName,
      resourceUri,
    );

    transport.close();
    return [output];
  } catch (e) {
    if (transport) transport.close();
    error = e instanceof Error ? e : new Error(String(e));
    if (ctx.continueOnFail()) {
      return [[{ json: { error: error.message, type: "mcp_error" } }]];
    }
    throw error;
  }
};
