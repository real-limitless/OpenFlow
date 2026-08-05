import type { NodeExecutor, ExecutionContext, INodeExecutionData, SdkHttpResponse } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions } from "@/sdk";

const DEFAULT_TIMEOUT = 60000;

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

interface McpContentItem {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

interface McpCallResult {
  content: McpContentItem[];
  isError?: boolean;
}

let rpcCounter = 0;
function nextRpcId(): number {
  rpcCounter += 1;
  return rpcCounter;
}

function resolveParam(ctx: ExecutionContext, name: string): string {
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

async function resolveAuth(
  ctx: ExecutionContext,
  authentication: string,
): Promise<Record<string, string>> {
  if (!authentication || authentication === "none") return {};

  if (authentication === "genericCredentialType" || authentication === "bearerAuth") {
    const cred = await ctx.getCredential("httpBearerAuth");
    if (!cred) throw new Error("MCP Client: httpBearerAuth credential is required");
    const token = String(cred.token ?? "");
    if (!token) throw new Error("MCP Client: httpBearerAuth credential is missing token");
    return { authorization: `Bearer ${token}` };
  }

  if (authentication === "headerAuth") {
    const cred = await ctx.getCredential("httpHeaderAuth");
    if (!cred) throw new Error("MCP Client: httpHeaderAuth credential is required");
    const headerName = String(cred.name ?? "X-API-Key");
    const headerValue = String(cred.value ?? "");
    if (!headerValue) throw new Error("MCP Client: httpHeaderAuth credential is missing value");
    return { [headerName]: headerValue };
  }

  if (authentication === "httpMultipleHeadersAuth") {
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

async function mcpCall(
  endpoint: string,
  method: string,
  params: Record<string, unknown> | undefined,
  authHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextRpcId(),
    method,
  };
  if (params) req.params = params;

  const http: (opts: SdkHttpRequestOptions) => Promise<SdkHttpResponse> = sdkHttpRequest;

  const res = await http({
    method: "POST",
    url: endpoint,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...authHeaders,
    },
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

export const mcpClientExecutor: NodeExecutor = async (ctx) => {
  const endpoint = resolveParam(ctx, "mcpEndpointUrl");
  if (!endpoint) {
    throw new Error("MCP Client: mcpEndpointUrl is required");
  }

  const authentication = ctx.getParam<string>("authentication", "none") ?? "none";
  const authHeaders = await resolveAuth(ctx, authentication);

  const toolName = resolveParam(ctx, "toolName");
  if (!toolName) {
    throw new Error("MCP Client: toolName is required");
  }

  const inputMode = ctx.getParam<string>("inputMode", "manual") ?? "manual";

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const convertToBinary = options.convertToBinary === true;
  const rawTimeout = options.timeout as number | undefined;
  const timeoutMs = typeof rawTimeout === "number" && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT;

  const items = ctx.getInputItems(0);
  const outputs: INodeExecutionData[] = [];

  for (const item of items) {
    let args: Record<string, unknown>;

    if (inputMode === "json") {
      const rawJson = ctx.getParam<string>("jsonParameters", "{}") ?? "{}";
      try {
        args = JSON.parse(rawJson);
      } catch {
        throw new Error("MCP Client: jsonParameters is not valid JSON");
      }
    } else {
      args = { ...item.json };
    }

    try {
      const result = (await mcpCall(
        endpoint,
        "tools/call",
        { name: toolName, arguments: args },
        authHeaders,
        timeoutMs,
      )) as McpCallResult | null;

      const content = result?.content ?? [];
      const isError = result?.isError === true;

      const outputJson: Record<string, unknown> = {
        toolName,
        content,
      };
      if (isError) {
        outputJson.isError = true;
      }

      const outputItem: INodeExecutionData = {
        json: outputJson,
        pairedItem: { item: 0, input: 0 },
      };

      if (convertToBinary) {
        const binary: Record<string, unknown> = {};
        let binaryIndex = 0;
        for (const entry of content) {
          if ((entry.type === "image" || entry.type === "audio") && entry.data) {
            const key = `${entry.type}_${binaryIndex}`;
            binary[key] = {
              data: entry.data,
              mimeType: entry.mimeType ?? (entry.type === "image" ? "image/png" : "audio/octet-stream"),
              fileName: `${entry.type}_${binaryIndex}`,
            };
            binaryIndex++;
          }
        }
        if (Object.keys(binary).length > 0) {
          outputItem.binary = binary as INodeExecutionData["binary"];
        }
      }

      outputs.push(outputItem);
    } catch (err) {
      if (ctx.continueOnFail()) {
        outputs.push({
          json: { toolName, content: [], isError: true },
          pairedItem: { item: 0, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }

  return [outputs];
};
