import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BATCH_SIZE = 50;

export interface EmbeddingsAzureOpenAiHandle {
  type: "@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi";
  resourceName: string;
  deploymentName: string;
  apiVersion: string;
  batchSize: number;
  stripNewLines: boolean;
  timeout: number;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export type EmbeddingsAzureOpenAiHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: EmbeddingsAzureOpenAiHttpClient | null = null;

export function setEmbeddingsAzureOpenAiHttpClient(factory: EmbeddingsAzureOpenAiHttpClient | null): void {
  httpOverride = factory;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
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

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401) {
    return new Error("Azure OpenAI authentication failed — check your API key.");
  }
  if (status === 404) {
    return new Error("Azure OpenAI deployment not found — check your deployment name.");
  }
  if (status === 429) {
    return new Error("Azure OpenAI rate limit exceeded — the service is receiving too many requests.");
  }
  return new Error(`Azure OpenAI API error (${status}): ${bodyStr}`);
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
    deploymentName: string;
    timeoutMs: number | undefined;
  },
  input: string[],
): Promise<number[][]> {
  const http = httpOverride ?? sdkHttpRequest;
  const headers: Record<string, string> = {
    "api-key": config.apiKey,
    "content-type": "application/json",
  };
  const body: Record<string, unknown> = {
    input,
    model: config.deploymentName,
    encoding_format: "float",
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= 2; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({
        method: "POST",
        url: config.baseUrl,
        headers,
        body,
        timeoutMs: config.timeoutMs,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Azure OpenAI embeddings request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      const b = res.body as {
        data?: Array<{ embedding?: number[] }>;
      };
      const data = b?.data ?? [];
      return data.map((d) => d.embedding ?? []);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < 2) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Azure OpenAI embeddings request failed after retries");
}

async function embedTexts(
  config: {
    baseUrl: string;
    apiKey: string;
    deploymentName: string;
    batchSize: number;
    stripNewLines: boolean;
    timeoutMs: number | undefined;
  },
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const prepared = config.stripNewLines
    ? texts.map((t) => t.replace(/[\n\r]/g, " "))
    : texts;

  const size = config.batchSize > 0 ? config.batchSize : prepared.length;
  const results: number[][] = [];

  for (let i = 0; i < prepared.length; i += size) {
    const batch = prepared.slice(i, i + size);
    const vectors = await embedBatch(config, batch);
    results.push(...vectors);
  }

  return results;
}

export const embeddingsAzureOpenAiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "azureOpenAiApi");
  const resourceName = String(credentials.resourceName ?? "");
  const apiKey = String(credentials.apiKey ?? "");
  const apiVersion = String(credentials.apiVersion ?? "");

  if (!resourceName) {
    throw new Error('Embeddings Azure OpenAI: credential "azureOpenAiApi" is missing resourceName');
  }
  if (!apiKey) {
    throw new Error('Embeddings Azure OpenAI: credential "azureOpenAiApi" is missing apiKey');
  }
  if (!apiVersion) {
    throw new Error('Embeddings Azure OpenAI: credential "azureOpenAiApi" is missing apiVersion');
  }

  const model = resolveString(ctx, "model", "");
  if (!model) {
    throw new Error("Embeddings Azure OpenAI: model (deployment name) parameter is required");
  }

  const batchSize = resolveNumber(ctx, "batchSize", DEFAULT_BATCH_SIZE);
  const stripNewLines = resolveBoolean(ctx, "stripNewLines", true);
  const timeout = resolveNumber(ctx, "timeout", -1);

  const baseUrl = `https://${resourceName}.openai.azure.com/openai/deployments/${model}/embeddings?api-version=${apiVersion}`;
  const timeoutMs = timeout > 0 ? timeout * 1000 : undefined;

  const config = {
    baseUrl,
    apiKey,
    deploymentName: model,
    batchSize,
    stripNewLines,
    timeoutMs,
  };

  const handle: EmbeddingsAzureOpenAiHandle = {
    type: "@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi",
    resourceName,
    deploymentName: model,
    apiVersion,
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
