import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const COHERE_RERANK_API_URL = "https://api.cohere.com/v2/rerank";
const DEFAULT_MODEL = "rerank-v3.5";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30000;

export interface RerankerCohereResult {
  index: number;
  relevance_score: number;
  document?: { text: string };
}

export interface RerankerCohereResponse {
  id: string;
  results: RerankerCohereResult[];
  meta?: Record<string, unknown>;
}

export type RerankerCohereHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: RerankerCohereHttpClient | null = null;

export function setRerankerCohereHttpClient(factory: RerankerCohereHttpClient | null): void {
  httpOverride = factory;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveParam<T>(ctx: ExecutionContext, name: string, fallback: T): T {
  const raw = ctx.getParam<unknown>(name, fallback as unknown as string);

  if (raw == null || raw === "") {
    return fallback;
  }

  if (typeof raw === "string" && raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, firstItemJson(ctx));
    return (resolved ?? fallback) as T;
  }

  return raw as T;
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

async function callRerank(
  apiKey: string,
  model: string,
  query: string,
  documents: string[],
  topN: number | undefined,
): Promise<RerankerCohereResponse> {
  const http = httpOverride ?? sdkHttpRequest;
  const body: Record<string, unknown> = {
    model,
    query,
    documents,
    return_documents: true,
  };
  if (topN !== undefined) {
    body.top_n = topN;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({
        method: "POST",
        url: COHERE_RERANK_API_URL,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < DEFAULT_MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Cohere rerank request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return res.body as RerankerCohereResponse;
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < DEFAULT_MAX_RETRIES) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Cohere rerank request failed after retries");
}

export const rerankerCohereExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "cohereApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Reranker Cohere: credential "cohereApi" is missing apiKey');
  }

  const model = resolveParam(ctx, "modelName", DEFAULT_MODEL);

  const handle = {
    type: "@n8n/n8n-nodes-langchain.rerankerCohere" as const,
    model,
    async rerank(params: {
      query: string;
      documents: Array<{ pageContent: string; metadata?: Record<string, unknown> }>;
      topN?: number;
    }): Promise<Array<{ pageContent: string; metadata?: Record<string, unknown>; relevanceScore: number }>> {
      if (!params.documents.length) {
        return [];
      }

      const topN = resolveParam(ctx, "topN", 3);
      const texts = params.documents.map((d) => d.pageContent);
      const response = await callRerank(apiKey, model, params.query, texts, topN);

      return response.results.map((result) => {
        const doc = params.documents[result.index];
        return {
          pageContent: doc.pageContent,
          metadata: doc.metadata,
          relevanceScore: result.relevance_score,
        };
      });
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
