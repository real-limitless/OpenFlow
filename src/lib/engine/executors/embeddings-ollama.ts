import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_MODEL = "all-minilm";
const DEFAULT_BASE_URL = "http://localhost:11434";

export interface EmbeddingsOllamaHandle {
  type: "@n8n/n8n-nodes-langchain.embeddingsOllama";
  model: string;
  baseUrl: string;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export type EmbeddingsOllamaHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: EmbeddingsOllamaHttpClient | null = null;

export function setEmbeddingsOllamaHttpClient(factory: EmbeddingsOllamaHttpClient | null): void {
  httpOverride = factory;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveModel(ctx: ExecutionContext): string {
  const raw = ctx.getParam<unknown>("model", DEFAULT_MODEL);
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
  if (status === 401) {
    return new Error("Ollama authentication failed — check your API key.");
  }
  if (status === 404) {
    return new Error(`Ollama model not found — pull the model first.`);
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

async function callEmbedApi(
  http: EmbeddingsOllamaHttpClient,
  baseUrl: string,
  model: string,
  apiKey: string | undefined,
  texts: string[],
  maxRetries: number,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const url = `${baseUrl.replace(/\/+$/, "")}/api/embed`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  const body = { model, input: texts };

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
      throw new Error(`Ollama embeddings request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      const b = res.body as { embeddings?: number[][] };
      return b?.embeddings ?? [];
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Ollama embeddings request failed after retries");
}

export const embeddingsOllamaExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "ollamaApi");
  const baseUrl = String(credentials.baseUrl ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const apiKey = credentials.apiKey ? String(credentials.apiKey) : undefined;

  const model = resolveModel(ctx);
  const http = httpOverride ?? sdkHttpRequest;

  const handle: EmbeddingsOllamaHandle = {
    type: "@n8n/n8n-nodes-langchain.embeddingsOllama",
    model,
    baseUrl,
    async embedQuery(text: string): Promise<number[]> {
      const vectors = await callEmbedApi(http, baseUrl, model, apiKey, [text], 2);
      return vectors[0] ?? [];
    },
    async embedDocuments(texts: string[]): Promise<number[][]> {
      return callEmbedApi(http, baseUrl, model, apiKey, texts, 2);
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
