import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_MODEL = "models/gemini-embedding-001";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_BATCH_SIZE = 100;

export interface EmbeddingsGoogleGeminiHandle {
  type: "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini";
  model: string;
  credentials: { apiKey: string; host: string };
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export type EmbeddingsGoogleGeminiHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: EmbeddingsGoogleGeminiHttpClient | null = null;

export function setEmbeddingsGoogleGeminiHttpClient(
  factory: EmbeddingsGoogleGeminiHttpClient | null,
): void {
  httpOverride = factory;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveModel(ctx: ExecutionContext): string {
  const raw = ctx.getParam<unknown>("modelName", DEFAULT_MODEL);
  if (raw == null || raw === "") return DEFAULT_MODEL;
  const str = String(raw);
  if (str.startsWith("=")) {
    const resolved = ctx.evaluate(str, firstItemJson(ctx));
    return String(resolved ?? "").trim() || DEFAULT_MODEL;
  }
  return str;
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401 || status === 403) {
    return new Error("Google AI authentication failed — check your API key.");
  }
  if (status === 429) {
    return new Error("Google AI rate limit exceeded — too many requests.");
  }
  return new Error(`Google Generative Language API error (${status}): ${bodyStr}`);
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

async function callEmbedContent(
  http: EmbeddingsGoogleGeminiHttpClient,
  baseUrl: string,
  model: string,
  apiKey: string,
  texts: string[],
  maxRetries: number,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const pathModel = model.replace(/^models\//, "");

  let url: string;
  let body: unknown;

  if (texts.length === 1) {
    url = `${baseUrl}/v1beta/models/${pathModel}:embedContent`;
    body = {
      model,
      content: { parts: [{ text: texts[0] }] },
    };
  } else {
    url = `${baseUrl}/v1beta/models/${pathModel}:batchEmbedContents`;
    body = {
      requests: texts.map((text) => ({
        model,
        content: { parts: [{ text }] },
      })),
    };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-goog-api-key": apiKey,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({ method: "POST", url, headers, body });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Google Gemini embeddings request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      const b = res.body as Record<string, unknown>;
      if (texts.length === 1) {
        const emb = (b as { embedding?: { values?: number[] } }).embedding;
        return [emb?.values ?? []];
      }
      const embeddings = (b as { embeddings?: Array<{ values?: number[] }> }).embeddings ?? [];
      return embeddings.map((e) => e.values ?? []);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Google Gemini embeddings request failed after retries");
}

export const embeddingsGoogleGeminiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "googlePalmApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Embeddings Google Gemini: credential "googlePalmApi" is missing apiKey');
  }

  const model = resolveModel(ctx);

  const http = httpOverride ?? sdkHttpRequest;

  const handle: EmbeddingsGoogleGeminiHandle = {
    type: "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini",
    model,
    credentials: { apiKey, host: DEFAULT_BASE_URL },
    async embedQuery(text: string): Promise<number[]> {
      const vectors = await callEmbedContent(http, DEFAULT_BASE_URL, model, apiKey, [text], 2);
      return vectors[0] ?? [];
    },
    async embedDocuments(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const results: number[][] = [];
      for (let i = 0; i < texts.length; i += DEFAULT_BATCH_SIZE) {
        const batch = texts.slice(i, i + DEFAULT_BATCH_SIZE);
        const vectors = await callEmbedContent(http, DEFAULT_BASE_URL, model, apiKey, batch, 2);
        results.push(...vectors);
      }
      return results;
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
