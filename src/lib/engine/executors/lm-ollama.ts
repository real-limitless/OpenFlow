import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

export interface OllamaGenerateResult {
  response: string;
  model: string;
  done: boolean;
}

export interface OllamaModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmOllama";
  model: string;
  options: Record<string, unknown>;
  baseUrl: string;
  invoke(prompt: string): Promise<OllamaGenerateResult>;
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
    throw new Error("Ollama Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("Ollama Model: model id resolved to empty");
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

function buildGenerateBody(
  model: string,
  prompt: string,
  options: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
  };

  const opts = buildOptionsObject(options);
  if (Object.keys(opts).length > 0) {
    body.options = opts;
  }

  const format = options.format;
  if (format === "json") {
    body.format = "json";
  }

  const system = options.system;
  if (system && typeof system === "string" && system.trim()) {
    body.system = system.trim();
  }

  const keepAlive = options.keepAlive;
  if (keepAlive && typeof keepAlive === "string" && keepAlive.trim()) {
    body.keep_alive = keepAlive.trim();
  }

  return body;
}

function buildOptionsObject(options: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const mapDirect: Record<string, string> = {
    temperature: "temperature",
    topK: "top_k",
    topP: "top_p",
    frequencyPenalty: "frequency_penalty",
    presencePenalty: "presence_penalty",
    repeatPenalty: "repeat_penalty",
    numPredict: "num_predict",
    numCtx: "num_ctx",
    numBatch: "num_batch",
    numThread: "num_thread",
    numGpu: "num_gpu",
    mainGpu: "main_gpu",
    lowVram: "low_vram",
    useMLock: "use_mlock",
    useMMap: "use_mmap",
    vocabOnly: "vocab_only",
    penalizeNewline: "penalize_newline",
    think: "think",
    seed: "seed",
    stop: "stop",
  };

  for (const [paramKey, ollamaKey] of Object.entries(mapDirect)) {
    if (options[paramKey] != null) {
      out[ollamaKey] = options[paramKey];
    }
  }

  return out;
}

function parseGenerateResponse(body: unknown): OllamaGenerateResult {
  const b = body as {
    model?: string;
    response?: string;
    done?: boolean;
  };
  return {
    response: b.response ?? "",
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
  prompt: string,
): Promise<OllamaGenerateResult> {
  if (!handle.hasCredential) {
    throw new Error('Ollama Model: credential "ollamaApi" is required');
  }

  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey);

  const url = `${handle.baseUrl}/api/generate`;
  const body = buildGenerateBody(handle.model, prompt, handle.options);

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
      return parseGenerateResponse(res.body);
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

export const lmOllamaExecutor: NodeExecutor = async (ctx) => {
  const credentials = (await ctx.getCredential("ollamaApi")) as Record<string, unknown> | null;
  const hasCredential = credentials != null;
  const baseUrl = resolveBaseUrl(credentials);
  const apiKey = credentials && typeof credentials.apiKey === "string" ? credentials.apiKey : "";

  const model = resolveModelId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: OllamaModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmOllama",
    model,
    options,
    baseUrl,
    invoke(prompt: string): Promise<OllamaGenerateResult> {
      return invokeModel({ model, options, baseUrl, apiKey, hasCredential }, prompt);
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
