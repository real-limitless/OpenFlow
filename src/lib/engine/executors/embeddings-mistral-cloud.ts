import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_MODEL = "mistral-embed";
const BASE_URL = "https://api.mistral.ai/v1";
const DEFAULT_MAX_RETRIES = 2;

export interface EmbeddingsMistralCloudHandle {
  type: "@n8n/n8n-nodes-langchain.embeddingsMistralCloud";
  model: string;
  batchSize: number;
  stripNewLines: boolean;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export type EmbeddingsMistralCloudHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: EmbeddingsMistralCloudHttpClient | null = null;

export function setEmbeddingsMistralCloudHttpClient(
  factory: EmbeddingsMistralCloudHttpClient | null,
): void {
  httpOverride = factory;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveModel(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("model", DEFAULT_MODEL);
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as { __rl?: boolean; value?: unknown }).value;
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

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function stripNewLines(text: string): string {
  return text.replace(/\n/g, "");
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401) {
    return new Error("Mistral authentication failed — check your API key.");
  }
  if (status === 402 || status === 403) {
    return new Error("Mistral insufficient quota — check your billing settings.");
  }
  if (status === 429) {
    return new Error("Mistral rate limit exceeded — the service is receiving too many requests.");
  }
  if (status === 422 || status === 400) {
    return new Error(`Mistral API input error (${status}): ${bodyStr}`);
  }
  return new Error(`Mistral API error (${status}): ${bodyStr}`);
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
    apiKey: string;
    model: string;
    maxRetries: number;
  },
  input: string[],
): Promise<number[][]> {
  const http = httpOverride ?? sdkHttpRequest;
  const headers = buildHeaders(config.apiKey);
  const url = `${BASE_URL}/embeddings`;
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
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Mistral embeddings request failed: ${lastError.message}`);
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

  throw lastError ?? new Error("Mistral embeddings request failed after retries");
}

async function embedTexts(
  config: {
    apiKey: string;
    model: string;
    batchSize: number;
    stripNewLines: boolean;
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

export const embeddingsMistralCloudExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "mistralCloudApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Embeddings Mistral Cloud: credential "mistralCloudApi" is missing apiKey');
  }

  const model = resolveModel(ctx);

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const batchSize =
    options && typeof options.batchSize === "number" ? options.batchSize : 0;
  const stripNewLines =
    options && typeof options.stripNewLines === "boolean" ? options.stripNewLines : true;

  const config = {
    apiKey,
    model,
    batchSize: batchSize > 0 ? batchSize : 0,
    stripNewLines,
    maxRetries: DEFAULT_MAX_RETRIES,
  };

  const handle: EmbeddingsMistralCloudHandle = {
    type: "@n8n/n8n-nodes-langchain.embeddingsMistralCloud",
    model,
    batchSize,
    stripNewLines,
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
