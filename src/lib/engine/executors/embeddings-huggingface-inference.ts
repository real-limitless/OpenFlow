import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_MODEL = "sentence-transformers/distilbert-base-nli-mean-tokens";
const CLASSIC_API = "https://api-inference.huggingface.co";
const PROVIDERS_ROUTER = "https://router.huggingface.co/v1/feature-extraction";

const PROVIDER_VALUES = [
  "hf-inference", "together", "replicate", "fireworks-ai", "groq",
  "cerebras", "cohere", "sambanova", "fal-ai", "novita", "nebius",
  "hyperbolic", "nscale", "ovhcloud", "openai", "black-forest-labs",
  "featherless-ai", "scaleway", "auto",
] as const;

export interface EmbeddingsHuggingFaceInferenceHandle {
  type: "@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference";
  modelName: string;
  endpointUrl: string;
  provider: string;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export type EmbeddingsHuggingFaceInferenceHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: EmbeddingsHuggingFaceInferenceHttpClient | null = null;

export function setEmbeddingsHuggingFaceInferenceHttpClient(
  factory: EmbeddingsHuggingFaceInferenceHttpClient | null,
): void {
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

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401 || status === 403) {
    return new Error("HuggingFace authentication failed — check your API key and permissions.");
  }
  if (status === 404) {
    return new Error("HuggingFace model not found — check the model name.");
  }
  if (status === 429 || status === 503) {
    return new Error("HuggingFace rate limit or quota exceeded — the service is receiving too many requests.");
  }
  return new Error(`HuggingFace API error (${status}): ${bodyStr}`);
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 503 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function callApi(
  config: {
    apiKey: string;
    url: string;
    body: unknown;
    timeoutMs: number | undefined;
  },
  maxRetries: number = 2,
): Promise<number[][]> {
  const http = httpOverride ?? sdkHttpRequest;
  const headers = buildHeaders(config.apiKey);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({
        method: "POST",
        url: config.url,
        headers,
        body: config.body,
        timeoutMs: config.timeoutMs,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`HuggingFace embeddings request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return res.body as number[][];
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("HuggingFace embeddings request failed after retries");
}

export const embeddingsHuggingFaceInferenceExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "huggingFaceApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Embeddings HuggingFace Inference: credential "huggingFaceApi" is missing apiKey');
  }

  const modelName = resolveString(ctx, "modelName", DEFAULT_MODEL);
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const endpointUrl = options?.endpointUrl ? String(options.endpointUrl) : "";
  const provider = options?.provider ? String(options.provider) : "auto";

  const timeoutMs: number | undefined = undefined;

  const handle: EmbeddingsHuggingFaceInferenceHandle = {
    type: "@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference",
    modelName: endpointUrl ? "" : modelName,
    endpointUrl,
    provider,
    async embedQuery(text: string): Promise<number[]> {
      const vectors = await handle.embedDocuments([text]);
      return vectors[0] ?? [];
    },
    async embedDocuments(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      if (endpointUrl) {
        const url = endpointUrl;
        const body = texts.length === 1 ? texts[0] : texts;
        return callApi({ apiKey, url, body, timeoutMs });
      }

      if (provider && provider !== "auto" && provider !== "hf-inference") {
        const url = PROVIDERS_ROUTER;
        const inputs = texts.length === 1 ? texts[0] : texts;
        const body: Record<string, unknown> = { model: modelName, inputs };
        if (provider) {
          body.provider = provider;
        }
        return callApi({ apiKey, url, body, timeoutMs });
      }

      const url = `${CLASSIC_API}/models/${modelName}`;
      const body = texts.length === 1 ? texts[0] : texts;
      return callApi({ apiKey, url, body, timeoutMs });
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
