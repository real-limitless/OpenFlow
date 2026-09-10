/**
 * mcp-flow agent gateway client.
 *
 * Agent keys (`mf_…`) authenticate to `{gateway}/mcp` (not admin REST /v1/backends).
 * Backend tools are `{slug}__{tool}` and often omit from tools/list; use mf_list_*.
 */
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";
import type { McpFlowBackend, McpFlowProject, McpFlowToolPreview } from "./types";

export type McpFlowHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

const DEFAULT_TIMEOUT_MS = 15000;
const PROTOCOL_VERSION = "2024-11-05";

let httpOverride: McpFlowHttpClient | null = null;

export function setMcpFlowGatewayHttpClient(factory: McpFlowHttpClient | null): void {
  httpOverride = factory;
}

export function mcpFlowMcpUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("mcp-flow URL is required");
  if (/\/mcp$/i.test(trimmed)) return trimmed;
  return `${trimmed}/mcp`;
}

export function isMcpFlowMetaTool(name: string): boolean {
  return name.startsWith("mf_");
}

export function toolBelongsToBackend(toolName: string, slug: string): boolean {
  const prefix = `${slug}__`;
  return toolName.startsWith(prefix);
}

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

let rpcId = 0;

function nextId(): number {
  rpcId += 1;
  return rpcId;
}

export function parseJsonRpcBody(body: unknown): JsonRpcResponse {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as JsonRpcResponse;
  }
  const text = String(body ?? "");
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.includes("data:")) {
    const datas = trimmed
      .split(/\r?\n/)
      .filter((line) => lStartsData(line))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    const last = datas[datas.length - 1];
    if (last) return JSON.parse(last) as JsonRpcResponse;
  }
  return JSON.parse(trimmed) as JsonRpcResponse;
}

function lStartsData(line: string): boolean {
  return line.startsWith("data:");
}

/** Parse MCP tools/call content[].text as JSON when possible. */
export function parseMcpToolContentJson(result: unknown): unknown {
  const r = result as { content?: Array<{ type?: string; text?: string }> } | null;
  const texts = (r?.content ?? [])
    .filter((p) => p && (p.type === "text" || p.type == null) && typeof p.text === "string")
    .map((p) => p.text as string);
  const joined = texts.join("");
  if (!joined) return result;
  try {
    return JSON.parse(joined) as unknown;
  } catch {
    return { text: joined };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

export function normalizeBackends(parsed: unknown): McpFlowBackend[] {
  const obj = asRecord(parsed);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(obj?.backends)
      ? obj.backends
      : Array.isArray(obj?.items)
        ? obj.items
        : [];
  const out: McpFlowBackend[] = [];
  for (const row of list) {
    const rec = asRecord(row);
    if (!rec) continue;
    const slug = str(rec.slug || rec.id || rec.name).trim();
    if (!slug) continue;
    out.push({
      slug,
      title: str(rec.title || rec.name || slug) || slug,
      transport: rec.transport != null ? str(rec.transport) : undefined,
      enabled: rec.enabled == null ? undefined : Boolean(rec.enabled),
      placement: rec.placement != null ? str(rec.placement) : undefined,
      url: rec.url != null ? str(rec.url) : undefined,
      hasHeaders: rec.hasHeaders == null ? undefined : Boolean(rec.hasHeaders),
      hasEnv: rec.hasEnv == null ? undefined : Boolean(rec.hasEnv),
      runsOn: rec.runsOn,
    });
  }
  return out;
}

export function normalizeProjects(parsed: unknown): McpFlowProject[] {
  const obj = asRecord(parsed);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(obj?.projects)
      ? obj.projects
      : Array.isArray(obj?.items)
        ? obj.items
        : [];
  const out: McpFlowProject[] = [];
  for (const row of list) {
    if (typeof row === "string" && row.trim()) {
      out.push({ slug: row.trim() });
      continue;
    }
    const rec = asRecord(row);
    if (!rec) continue;
    const slug = str(rec.slug || rec.id || rec.name).trim();
    if (!slug) continue;
    const backendSlugs = Array.isArray(rec.backendSlugs)
      ? rec.backendSlugs.map((s) => String(s))
      : undefined;
    out.push({
      slug,
      title: rec.title != null ? str(rec.title) : undefined,
      backendSlugs,
    });
  }
  return out;
}

export function normalizeToolPreviews(parsed: unknown): McpFlowToolPreview[] {
  const obj = asRecord(parsed);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(obj?.tools)
      ? obj.tools
      : Array.isArray(obj?.items)
        ? obj.items
        : [];
  const out: McpFlowToolPreview[] = [];
  for (const row of list) {
    const rec = asRecord(row);
    if (!rec) continue;
    const name = str(rec.name).trim();
    if (!name) continue;
    const schema =
      rec.inputSchema && typeof rec.inputSchema === "object" && !Array.isArray(rec.inputSchema)
        ? (rec.inputSchema as Record<string, unknown>)
        : undefined;
    out.push({
      name,
      description: rec.description != null ? str(rec.description) : undefined,
      backend: rec.backend != null ? str(rec.backend) : undefined,
      inputSchema: schema,
    });
  }
  return out;
}

export function mergeToolCatalogs(
  listed: McpFlowToolPreview[],
  namespaced: McpFlowToolPreview[],
): McpFlowToolPreview[] {
  const map = new Map<string, McpFlowToolPreview>();
  for (const t of namespaced) {
    if (t.name) map.set(t.name, { ...t });
  }
  for (const t of listed) {
    const prev = map.get(t.name);
    map.set(t.name, {
      name: t.name,
      description: t.description || prev?.description,
      backend: t.backend || prev?.backend,
      inputSchema: t.inputSchema ?? prev?.inputSchema,
    });
  }
  return [...map.values()];
}

export function filterToolsForBackends(
  tools: McpFlowToolPreview[],
  slugs: string[],
  includeMeta: boolean,
): McpFlowToolPreview[] {
  const want = slugs.map((s) => s.trim()).filter(Boolean);
  return tools.filter((t) => {
    if (isMcpFlowMetaTool(t.name)) return includeMeta;
    if (want.length === 0) return true;
    if (t.backend && want.includes(t.backend)) return true;
    return want.some((slug) => toolBelongsToBackend(t.name, slug));
  });
}

export type McpFlowSessionOptions = {
  url: string;
  apiKey: string;
  timeoutMs?: number;
  http?: McpFlowHttpClient;
};

export class McpFlowSession {
  readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly http: McpFlowHttpClient;
  sessionId: string | null = null;

  constructor(opts: McpFlowSessionOptions) {
    this.endpoint = mcpFlowMcpUrl(opts.url);
    this.apiKey = opts.apiKey.trim();
    if (!this.apiKey) throw new Error("mcp-flow API key is required");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.http = opts.http ?? httpOverride ?? sdkHttpRequest;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.apiKey}`,
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    return headers;
  }

  private rememberSession(res: SdkHttpResponse): void {
    const sid =
      res.headers["mcp-session-id"] ||
      res.headers["Mcp-Session-Id"] ||
      res.headers["MCP-Session-Id"];
    if (sid) this.sessionId = sid;
  }

  private async post(req: JsonRpcRequest): Promise<SdkHttpResponse> {
    const res = await this.http({
      method: "POST",
      url: this.endpoint,
      headers: this.headers(),
      body: req,
      timeoutMs: this.timeoutMs,
    });
    this.rememberSession(res);
    return res;
  }

  async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: nextId(),
      method,
    };
    if (params) req.params = params;
    const res = await this.post(req);
    if (res.status < 200 || res.status >= 300) {
      const bodyStr = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      throw new Error(`mcp-flow ${method} failed (HTTP ${res.status}): ${bodyStr}`);
    }
    const parsed = parseJsonRpcBody(res.body);
    if (parsed.error) {
      throw new Error(
        `mcp-flow ${method} RPC error (${parsed.error.code}): ${parsed.error.message}`,
      );
    }
    return parsed.result;
  }

  async initialize(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "openflow", version: "0.0.0" },
    });
    try {
      await this.post({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
    } catch {
      /* some gateways ignore the notification */
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.rpc("tools/call", { name, arguments: args });
  }

  async listToolsRpc(): Promise<McpFlowToolPreview[]> {
    const all: McpFlowToolPreview[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const params: Record<string, unknown> = {};
      if (cursor) params.cursor = cursor;
      const result = await this.rpc("tools/list", params);
      const rec = asRecord(result);
      const tools = normalizeToolPreviews(result);
      all.push(...tools);
      cursor = rec?.nextCursor != null ? str(rec.nextCursor) : undefined;
      if (!cursor) break;
    }
    return all;
  }

  async mfStatus(): Promise<unknown> {
    return parseMcpToolContentJson(await this.callTool("mf_status"));
  }

  async mfListProjects(): Promise<McpFlowProject[]> {
    return normalizeProjects(parseMcpToolContentJson(await this.callTool("mf_list_projects")));
  }

  async mfUseProject(project: string): Promise<unknown> {
    return parseMcpToolContentJson(
      await this.callTool("mf_use_project", { project, mintSessionToken: false }),
    );
  }

  async mfListBackends(): Promise<{ project?: unknown; backends: McpFlowBackend[] }> {
    const parsed = parseMcpToolContentJson(await this.callTool("mf_list_backends"));
    const rec = asRecord(parsed);
    return {
      project: rec?.project,
      backends: normalizeBackends(parsed),
    };
  }

  async mfListTools(): Promise<McpFlowToolPreview[]> {
    return normalizeToolPreviews(parseMcpToolContentJson(await this.callTool("mf_list_tools")));
  }

  async discoverTools(opts?: {
    project?: string;
    backends?: string[];
    includeMetaTools?: boolean;
  }): Promise<McpFlowToolPreview[]> {
    if (opts?.project?.trim()) {
      await this.mfUseProject(opts.project.trim());
    }
    let listed: McpFlowToolPreview[] = [];
    try {
      listed = await this.listToolsRpc();
    } catch {
      listed = [];
    }
    let namespaced: McpFlowToolPreview[] = [];
    try {
      namespaced = await this.mfListTools();
    } catch {
      namespaced = [];
    }
    const merged = mergeToolCatalogs(listed, namespaced);
    let slugs = (opts?.backends ?? []).map((s) => s.trim()).filter(Boolean);
    if (slugs.length === 0) {
      try {
        const listedBackends = await this.mfListBackends();
        const enabled = listedBackends.backends
          .filter((b) => b.enabled !== false)
          .map((b) => b.slug);
        if (enabled.length > 0) slugs = enabled;
      } catch {
        /* keep empty → include all namespaced */
      }
    }
    return filterToolsForBackends(merged, slugs, Boolean(opts?.includeMetaTools));
  }
}

export async function connectMcpFlow(opts: McpFlowSessionOptions): Promise<McpFlowSession> {
  const session = new McpFlowSession(opts);
  await session.initialize();
  return session;
}
