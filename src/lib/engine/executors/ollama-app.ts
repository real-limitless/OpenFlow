import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_TOOL_ITERATIONS = 20;

export type OllamaHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: OllamaHttpClient | null = null;

export function setOllamaHttpClient(factory: OllamaHttpClient | null): void {
  httpOverride = factory;
}

let fetchOverride: ((url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>) | null = null;

export function setFetchOverride(fn: ((url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>) | null): void {
  fetchOverride = fn;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
  cachedResultName?: string;
}

interface MessageEntry {
  content: string;
  role: string;
}

interface FixedCollection {
  values?: MessageEntry[];
}

interface ToolCallFunction {
  name: string;
  arguments: string;
}

interface OllamaToolCall {
  function: ToolCallFunction;
}

interface OllamaChatResponseMessage {
  role?: string;
  content?: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatResponse {
  model?: string;
  message?: OllamaChatResponseMessage;
  created_at?: string;
  done?: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

function resolveModelId(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("modelId");
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }

  if (raw == null || raw === "") {
    throw new Error("Ollama App: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("Ollama App: model id resolved to empty");
  }
  return modelId;
}

function resolveBaseUrl(credentials: Record<string, unknown> | null): string {
  const fromCred =
    credentials && typeof credentials.baseUrl === "string" && credentials.baseUrl.trim()
      ? credentials.baseUrl.trim()
      : "";
  if (fromCred) return fromCred;
  const fromEnv = typeof process !== "undefined" ? process.env?.OLLAMA_HOST : undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return DEFAULT_BASE_URL;
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function buildOptionsObject(options: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const mapDirect: Record<string, string> = {
    temperature: "temperature",
    top_k: "top_k",
    top_p: "top_p",
    topK: "top_k",
    topP: "top_p",
    frequency_penalty: "frequency_penalty",
    presence_penalty: "presence_penalty",
    repeat_penalty: "repeat_penalty",
    num_predict: "num_predict",
    num_ctx: "num_ctx",
    num_batch: "num_batch",
    num_thread: "num_thread",
    num_gpu: "num_gpu",
    main_gpu: "main_gpu",
    low_vram: "low_vram",
    use_mlock: "use_mlock",
    use_mmap: "use_mmap",
    vocab_only: "vocab_only",
    penalize_newline: "penalize_newline",
    think: "think",
    seed: "seed",
    stop: "stop",
    keep_alive: "keep_alive",
    min_p: "min_p",
    repeat_last_n: "repeat_last_n",
  };
  for (const [key, ollamaKey] of Object.entries(mapDirect)) {
    if (options[key] != null && options[key] !== "") {
      out[ollamaKey] = options[key];
    }
  }
  return out;
}

function buildChatMessages(
  resource: string,
  operation: string,
  ctx: ExecutionContext,
  items: INodeExecutionData[],
): Array<{ role: string; content: string; images?: string[] }> {
  if (resource === "text" && operation === "message") {
    const system = ctx.getParam<string>("options.system", "");
    const messages = ctx.getParam<FixedCollection>("messages", {});
    const entries = messages?.values ?? [];
    const result: Array<{ role: string; content: string; images?: string[] }> = [];
    if (system && system.trim()) {
      result.push({ role: "system", content: system.trim() });
    }
    for (const entry of entries) {
      if (entry.content) {
        result.push({ role: entry.role, content: entry.content });
      }
    }
    return result;
  }

  if (resource === "image" && operation === "analyze") {
    const prompt = ctx.getParam<string>("text", "What's in this image?");
    const system = ctx.getParam<string>("options.system", "");
    const result: Array<{ role: string; content: string; images?: string[] }> = [];
    if (system && system.trim()) {
      result.push({ role: "system", content: system.trim() });
    }
    const userMessage: { role: string; content: string; images?: string[] } = {
      role: "user",
      content: prompt,
    };
    const inputType = ctx.getParam<string>("inputType", "binary");
    if (inputType === "binary") {
      const binaryField = ctx.getParam<string>("binaryPropertyName", "data");
      const imageFields = binaryField.split(",").map((s) => s.trim()).filter(Boolean);
      const images: string[] = [];
      for (const item of items) {
        if (item.binary) {
          for (const field of imageFields) {
            const binData = item.binary[field];
            if (binData && binData.data) {
              images.push(binData.data);
            }
          }
        }
      }
      if (images.length > 0) {
        userMessage.images = images;
      } else {
        throw new Error(`Image decode / binary field missing: no data found for "${binaryField}"`);
      }
    } else if (inputType === "url") {
      const imageUrls = ctx.getParam<string>("imageUrls", "");
      if (imageUrls) {
        const urls = imageUrls.split(",").map((s) => s.trim()).filter(Boolean);
        userMessage.images = urls;
      }
    }
    result.push(userMessage);
    return result;
  }

  return [{ role: "user", content: "" }];
}

function buildRequestBody(
  model: string,
  messages: Array<Record<string, unknown>>,
  options: Record<string, unknown>,
  resource: string,
): Record<string, unknown> {
  const opts = buildOptionsObject(options);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };
  if (Object.keys(opts).length > 0) {
    body.options = opts;
  }
  const format = options.format;
  if (format === "json") {
    body.format = "json";
  }
  const keepAlive = options.keep_alive ?? options.keepAlive;
  if (keepAlive && typeof keepAlive === "string" && keepAlive.trim()) {
    body.keep_alive = keepAlive.trim();
  }
  return body;
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401 || status === 403) {
    return new Error(`Ollama authentication error (${status}) — check your API key. ${bodyStr}`);
  }
  if (status === 404) {
    return new Error(`Ollama model or endpoint not found (404): ${bodyStr}`);
  }
  if (status === 400) {
    return new Error(`Ollama bad request (400): ${bodyStr}`);
  }
  return new Error(`Ollama API error (${status}): ${bodyStr}`);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function fetchUrlAsBase64(url: string): Promise<string> {
  const fetchFn = fetchOverride ?? globalThis.fetch.bind(globalThis);
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Ollama App: failed to fetch image URL ${url} (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function resolveImageUrls(
  messages: Array<{ role: string; content: string; images?: string[] }>,
): Promise<void> {
  for (const msg of messages) {
    if (msg.images && msg.images.length > 0) {
      const resolved: string[] = [];
      for (const img of msg.images) {
        if (img.startsWith("http://") || img.startsWith("https://")) {
          resolved.push(await fetchUrlAsBase64(img));
        } else {
          resolved.push(img);
        }
      }
      msg.images = resolved;
    }
  }
}

interface ToolHandle {
  name: string;
  description?: string;
  schema?: unknown;
  invoke?(args: Record<string, unknown>): Promise<string> | string;
}

function getToolHandlesFromInput(ctx: ExecutionContext): ToolHandle[] {
  const toolItems = ctx.getInputItems(1);
  if (!toolItems || toolItems.length === 0) return [];
  const handles: ToolHandle[] = [];
  const seen = new Set<string>();
  for (const item of toolItems) {
    const json = item.json;
    if (!json || typeof json !== "object") continue;
    const maybe = json as Record<string, unknown>;
    if (typeof maybe.name === "string" && !seen.has(maybe.name as string)) {
      seen.add(maybe.name as string);
      handles.push(maybe as unknown as ToolHandle);
    }
  }
  return handles;
}

function toolHandlesToOllamaTools(handles: ToolHandle[]): unknown[] {
  return handles.map((h) => ({
    type: "function",
    function: {
      name: h.name,
      description: h.description ?? "",
      parameters: h.schema ?? {},
    },
  }));
}

function parseToolCalls(msg: OllamaChatResponseMessage | undefined): OllamaToolCall[] {
  if (!msg || !msg.tool_calls || !Array.isArray(msg.tool_calls)) return [];
  return msg.tool_calls;
}

async function invokeTool(
  toolCall: OllamaToolCall,
  handles: ToolHandle[],
): Promise<string> {
  const name = toolCall.function?.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function?.arguments ?? "{}");
  } catch {
    args = {};
  }
  const handle = handles.find((h) => h.name === name);
  if (!handle) {
    return JSON.stringify({ error: `Tool "${name}" not found` });
  }
  if (typeof handle.invoke !== "function") {
    return JSON.stringify({ error: `Tool "${name}" has no invoke function` });
  }
  const result = await handle.invoke(args);
  return typeof result === "string" ? result : JSON.stringify(result);
}

async function doChatRequest(
  http: OllamaHttpClient,
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeout: number,
  maxRetries: number,
): Promise<SdkHttpResponse> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await http({ method: "POST", url, headers, body, timeoutMs: timeout });
      if (res.status >= 200 && res.status < 300) return res;
      lastError = classifyError(res.status, res.body);
      if (isRetryable(res.status) && attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Ollama")) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Ollama request failed: ${lastError.message}`);
    }
  }
  throw lastError ?? new Error("Ollama request failed after retries");
}

function buildOutputItem(
  parsed: OllamaChatResponse,
  model: string,
  item: INodeExecutionData,
  idx: number,
  simplify: boolean,
): INodeExecutionData {
  if (simplify) {
    return {
      json: {
        messages: [
          { role: parsed.message?.role ?? "assistant", content: parsed.message?.content ?? "" },
        ],
        model: parsed.model ?? model,
        usage: {
          prompt_eval_count: parsed.prompt_eval_count,
          eval_count: parsed.eval_count,
        },
      },
      pairedItem: item.pairedItem ?? { item: idx, input: 0 },
    };
  }
  return {
    json: {
      model: parsed.model,
      created_at: parsed.created_at,
      message: parsed.message,
      done: parsed.done,
      done_reason: parsed.done_reason,
      total_duration: parsed.total_duration,
      load_duration: parsed.load_duration,
      prompt_eval_count: parsed.prompt_eval_count,
      eval_count: parsed.eval_count,
      eval_duration: parsed.eval_duration,
    },
    pairedItem: item.pairedItem ?? { item: idx, input: 0 },
  };
}

export const ollamaAppExecutor: NodeExecutor = async (ctx) => {
  const credentials = (await ctx.getCredential("ollamaApi")) as Record<string, unknown> | null;
  if (!credentials) {
    throw new Error('Ollama App: credential "ollamaApi" is required');
  }

  const baseUrl = resolveBaseUrl(credentials);
  const apiKey = credentials && typeof credentials.apiKey === "string" ? credentials.apiKey : "";
  const model = resolveModelId(ctx);
  const resource = ctx.getParam<string>("resource", "text");
  const operation = ctx.getParam<string>("operation", resource === "image" ? "analyze" : "message");
  const simplify = ctx.getParam<boolean>("simplify", true);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const items = ctx.getInputItems(0);

  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(apiKey);

  const messages = await buildChatMessages(resource, operation, ctx, items as INodeExecutionData[]);

  if (resource === "image" && operation === "analyze") {
    await resolveImageUrls(messages);
  }

  const toolHandles = getToolHandlesFromInput(ctx);
  const hasTools = toolHandles.length > 0;

  const url = `${baseUrl}/api/chat`;
  const body = buildRequestBody(model, messages, options, resource);
  if (hasTools) {
    body.tools = toolHandlesToOllamaTools(toolHandles);
  }

  let currentMessages: Array<Record<string, unknown>> = [...messages];
  let parsed: OllamaChatResponse = {};

  if (hasTools) {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const body2 = buildRequestBody(model, currentMessages, options, resource);
      body2.tools = toolHandlesToOllamaTools(toolHandles);

      const res = await doChatRequest(http, url, headers, body2, timeout, maxRetries);
      parsed = res.body as OllamaChatResponse;

      const toolCalls = parseToolCalls(parsed.message);
      if (toolCalls.length === 0) break;

      currentMessages.push({
        role: parsed.message?.role ?? "assistant",
        content: parsed.message?.content ?? "",
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        const result = await invokeTool(tc, toolHandles);
        currentMessages.push({
          role: "tool",
          content: result,
        });
      }
    }
  } else {
    const res = await doChatRequest(http, url, headers, body, timeout, maxRetries);
    parsed = res.body as OllamaChatResponse;
  }

  const outputItems: INodeExecutionData[] = items.map((item, idx) =>
    buildOutputItem(parsed, model, item, idx, simplify),
  );
  return [outputItems];
};
