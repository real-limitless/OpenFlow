import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface OllamaCompletionResult {
  text: string;
  model: string;
  done: boolean;
}

export interface OllamaModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatOllama";
  model: string;
  options: Record<string, unknown>;
  baseUrl: string;
  invoke(messages: OllamaChatMessage[]): Promise<OllamaCompletionResult>;
}

export type OllamaHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: OllamaHttpClient | null = null;

export function setOllamaHttpClient(factory: OllamaHttpClient | null): void {
  httpOverride = factory;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
  cachedResultName?: string;
}

function resolveModelId(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("model");
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }

  if (raw == null || raw === "") {
    throw new Error("Ollama Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("Ollama Chat Model: model id resolved to empty");
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
  if (options.temperature != null) out.temperature = options.temperature;
  if (options.topK != null) out.top_k = options.topK;
  if (options.topP != null) out.top_p = options.topP;
  return out;
}

function buildChatBody(
  model: string,
  messages: OllamaChatMessage[],
  options: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };
  const opts = buildOptionsObject(options);
  if (Object.keys(opts).length > 0) {
    body.options = opts;
  }
  return body;
}

function parseChatResponse(body: unknown): OllamaCompletionResult {
  const b = body as {
    model?: string;
    message?: { role?: string; content?: string };
    done?: boolean;
  };
  return {
    text: b.message?.content ?? "",
    model: b.model ?? "",
    done: b.done ?? true,
  };
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

async function invokeModel(
  handle: {
    model: string;
    options: Record<string, unknown>;
    baseUrl: string;
    apiKey: string;
    hasCredential: boolean;
  },
  messages: OllamaChatMessage[],
): Promise<OllamaCompletionResult> {
  if (!handle.hasCredential) {
    throw new Error('Ollama Chat Model: credential "ollamaApi" is required');
  }

  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey);

  const url = `${handle.baseUrl}/api/chat`;
  const body = buildChatBody(handle.model, messages, handle.options);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({ method: "POST", url, headers, body, timeoutMs: timeout });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Ollama request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return parseChatResponse(res.body);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Ollama request failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export const lmChatOllamaExecutor: NodeExecutor = async (ctx) => {
  const credentials = (await ctx.getCredential("ollamaApi")) as Record<string, unknown> | null;
  const hasCredential = credentials != null;
  const baseUrl = resolveBaseUrl(credentials);
  const apiKey = credentials && typeof credentials.apiKey === "string" ? credentials.apiKey : "";

  const model = resolveModelId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: OllamaModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatOllama",
    model,
    options,
    baseUrl,
    invoke(messages: OllamaChatMessage[]): Promise<OllamaCompletionResult> {
      return invokeModel({ model, options, baseUrl, apiKey, hasCredential }, messages);
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