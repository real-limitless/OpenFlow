import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const COHERE_API_URL = "https://api.cohere.com/v2/embed";
const DEFAULT_MODEL = "embed-english-v2.0";
const COHERE_BATCH_SIZE = 96;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30000;

export interface EmbeddingsCohereHandle {
  type: "@n8n/n8n-nodes-langchain.embeddingsCohere";
  model: string;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export type EmbeddingsCohereHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: EmbeddingsCohereHttpClient | null = null;

export function setEmbeddingsCohereHttpClient(factory: EmbeddingsCohereHttpClient | null): void {
  httpOverride = factory;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveModel(ctx: ExecutionContext): string {
  const raw = ctx.getParam<unknown>("model", DEFAULT_MODEL);

  if (raw == null || raw === "") {
    return DEFAULT_MODEL;
  }

  const str = String(raw);
  if (str.startsWith("=")) {
    const resolved = ctx.evaluate(str, firstItemJson(ctx));
    return String(resolved ?? "").trim() || DEFAULT_MODEL;
  }
  return str;
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401) {
    return new Error("Cohere authentication failed — check your API key.");
  }
  if (status === 429) {
    return new Error("Cohere rate limit exceeded — the service is receiving too many requests.");
  }
  if (status === 403) {
    return new Error("Cohere quota exceeded — check your billing settings.");
  }
  return new Error(`Cohere API error (${status}): ${bodyStr}`);
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
  config: { apiKey: string; model: string; timeoutMs: number; maxRetries: number },
  texts: string[],
): Promise<number[][]> {
  const http = httpOverride ?? sdkHttpRequest;
  const body = {
    model: config.model,
    input_type: "search_document",
    texts,
    embedding_types: ["float"],
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({
        method: "POST",
        url: COHERE_API_URL,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body,
        timeoutMs: config.timeoutMs,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Cohere embeddings request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      const b = res.body as { embeddings?: { float?: number[][] } };
      return b?.embeddings?.float ?? [];
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < config.maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Cohere embeddings request failed after retries");
}

async function embedTexts(
  config: { apiKey: string; model: string; timeoutMs: number; maxRetries: number },
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += COHERE_BATCH_SIZE) {
    const batch = texts.slice(i, i + COHERE_BATCH_SIZE);
    const vectors = await embedBatch(config, batch);
    results.push(...vectors);
  }

  return results;
}

export const embeddingsCohereExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "cohereApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Embeddings Cohere: credential "cohereApi" is missing apiKey');
  }

  const model = resolveModel(ctx);

  const config = {
    apiKey,
    model,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  };

  const handle: EmbeddingsCohereHandle = {
    type: "@n8n/n8n-nodes-langchain.embeddingsCohere",
    model,
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
