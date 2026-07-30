import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_BATCH_SIZE = 512;
const DEFAULT_MAX_RETRIES = 2;

export interface EmbeddingsOpenAiHandle {
  type: "@n8n/n8n-nodes-langchain.embeddingsOpenAi";
  model: string;
  baseUrl: string;
  batchSize: number;
  stripNewLines: boolean;
  timeout: number;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export type EmbeddingsOpenAiHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: EmbeddingsOpenAiHttpClient | null = null;

export function setEmbeddingsOpenAiHttpClient(factory: EmbeddingsOpenAiHttpClient | null): void {
  httpOverride = factory;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
  cachedResultName?: string;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveModel(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("model", DEFAULT_MODEL);
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }

  if (raw == null || raw === "") {
    raw = DEFAULT_MODEL;
  }

  const str = String(raw);
  if (str.startsWith("=")) {
    const resolved = ctx.evaluate(str, firstItemJson(ctx));
    const modelId = String(resolved ?? "").trim();
    return modelId || DEFAULT_MODEL;
  }
  return str;
}

function resolveString(ctx: ExecutionContext, name: string, defaultValue: string): string {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return String(ctx.evaluate(raw, firstItemJson(ctx)) ?? defaultValue);
    }
    return raw;
  }
  if (raw == null) return defaultValue;
  return String(raw);
}

function resolveNumber(ctx: ExecutionContext, name: string, defaultValue: number): number {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  let n: number;
  if (typeof raw === "string" && raw.startsWith("=")) {
    n = Number(ctx.evaluate(raw, firstItemJson(ctx)));
  } else {
    n = Number(raw ?? defaultValue);
  }
  if (!Number.isFinite(n)) return defaultValue;
  return n;
}

function resolveBoolean(ctx: ExecutionContext, name: string, defaultValue: boolean): boolean {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return Boolean(ctx.evaluate(raw, firstItemJson(ctx)));
    }
    return raw === "true";
  }
  return defaultValue;
}

function buildHeaders(apiKey: string, organizationId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
  if (organizationId) {
    headers["openai-organization"] = organizationId;
  }
  return headers;
}

function joinBaseUrl(baseURL: string): string {
  const trimmed = baseURL.trim();
  const base = trimmed === "" ? DEFAULT_BASE_URL : trimmed;
  return base.replace(/\/+$/, "");
}

function stripNewLines(text: string): string {
  return text.replace(/\n/g, "");
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401) {
    return new Error("OpenAI authentication failed — check your API key and organization ID.");
  }
  if (status === 429) {
    return new Error("OpenAI rate limit exceeded — the service is receiving too many requests.");
  }
  if (status === 403 || bodyStr.includes("insufficient_quota")) {
    return new Error(
      "OpenAI insufficient quota — check your organization, project, and billing settings.",
    );
  }
  return new Error(`OpenAI API error (${status}): ${bodyStr}`);
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

async function embedBatch(
  config: {
    baseUrl: string;
    apiKey: string;
    organizationId?: string;
    model: string;
    timeoutMs: number | undefined;
    maxRetries: number;
  },
  input: string[],
): Promise<number[][]> {
  const http = httpOverride ?? sdkHttpRequest;
  const headers = buildHeaders(config.apiKey, config.organizationId);
  const url = `${config.baseUrl}/embeddings`;
  const body: Record<string, unknown> = { model: config.model, input };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({
        method: "POST",
        url,
        headers,
        body,
        timeoutMs: config.timeoutMs,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`OpenAI embeddings request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      const b = res.body as {
        data?: Array<{ embedding?: number[] }>;
      };
      const data = b?.data ?? [];
      return data.map((d) => d.embedding ?? []);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < config.maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("OpenAI embeddings request failed after retries");
}

async function embedTexts(
  config: {
    baseUrl: string;
    apiKey: string;
    organizationId?: string;
    model: string;
    batchSize: number;
    stripNewLines: boolean;
    timeoutMs: number | undefined;
    maxRetries: number;
  },
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const prepared = config.stripNewLines ? texts.map((t) => stripNewLines(t)) : texts;

  const size = config.batchSize > 0 ? config.batchSize : prepared.length;
  const results: number[][] = [];

  for (let i = 0; i < prepared.length; i += size) {
    const batch = prepared.slice(i, i + size);
    const vectors = await embedBatch(config, batch);
    results.push(...vectors);
  }

  return results;
}

export const embeddingsOpenAiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "openAiApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Embeddings OpenAI: credential "openAiApi" is missing apiKey');
  }
  const organizationId = credentials.organizationId
    ? String(credentials.organizationId)
    : undefined;

  const model = resolveModel(ctx);
  const baseURL = resolveString(ctx, "baseURL", "");
  const batchSize = resolveNumber(ctx, "batchSize", DEFAULT_BATCH_SIZE);
  const stripNewLines = resolveBoolean(ctx, "stripNewLines", true);
  const timeout = resolveNumber(ctx, "timeout", -1);

  const baseUrl = joinBaseUrl(baseURL);
  const timeoutMs = timeout > 0 ? timeout * 1000 : undefined;

  const config = {
    baseUrl,
    apiKey,
    organizationId,
    model,
    batchSize,
    stripNewLines,
    timeoutMs,
    maxRetries: DEFAULT_MAX_RETRIES,
  };

  const handle: EmbeddingsOpenAiHandle = {
    type: "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
    model,
    baseUrl,
    batchSize,
    stripNewLines,
    timeout,
    async embedQuery(text: string): Promise<number[]> {
      const vectors = await embedTexts(config, [text]);
      return vectors[0] ?? [];
    },
    async embedDocuments(texts: string[]): Promise<number[][]> {
      return embedTexts(config, texts);
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
