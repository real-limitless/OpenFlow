import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_API_BASE = "https://api-inference.huggingface.co";

export interface HuggingFaceGenerationResult {
  generated_text: string;
}

export interface HuggingFaceChatMessage {
  role: string;
  content: string | unknown;
}

export interface HuggingFaceModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmOpenHuggingFaceInference";
  model: string;
  options: Record<string, unknown>;
  endpointUrl: string;
  invoke(messages: HuggingFaceChatMessage[]): Promise<{ text: string }>;
}

export type HuggingFaceInferenceHttpClient = (
  options: SdkHttpRequestOptions,
) => Promise<SdkHttpResponse>;

let httpOverride: HuggingFaceInferenceHttpClient | null = null;

export function setHuggingFaceInferenceHttpClient(
  factory: HuggingFaceInferenceHttpClient | null,
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
    return new Error("HuggingFace authentication error — check your API key.");
  }
  if (status === 404) {
    return new Error("HuggingFace model not found (404).");
  }
  if (status === 429 || status === 503) {
    return new Error("HuggingFace rate limit or quota exceeded (429).");
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

function flattenMessages(messages: HuggingFaceChatMessage[]): string {
  return messages
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (m.role === "system") return `System: ${content}`;
      if (m.role === "assistant") return `Assistant: ${content}`;
      return `User: ${content}`;
    })
    .join("\n");
}

function buildGenerateBody(
  inputs: string,
  options: Record<string, unknown>,
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};

  if (options.temperature != null && Number(options.temperature) !== 0) {
    parameters.temperature = Number(options.temperature);
  }
  if (options.maxTokens != null && Number(options.maxTokens) > 0) {
    parameters.max_new_tokens = Number(options.maxTokens);
  }
  if (options.topP != null && Number(options.topP) !== 0) {
    parameters.top_p = Number(options.topP);
  }
  if (options.topK != null && Number(options.topK) !== 0) {
    parameters.top_k = Number(options.topK);
  }
  if (options.frequencyPenalty != null && Number(options.frequencyPenalty) !== 0) {
    parameters.frequency_penalty = Number(options.frequencyPenalty);
  }
  if (options.presencePenalty != null && Number(options.presencePenalty) !== 0) {
    parameters.repetition_penalty = Number(options.presencePenalty);
  }

  const body: Record<string, unknown> = { inputs };
  if (Object.keys(parameters).length > 0) {
    body.parameters = parameters;
  }
  return body;
}

function parseGenerateResponse(body: unknown): string {
  if (Array.isArray(body) && body.length > 0) {
    const first = body[0] as { generated_text?: string };
    return first.generated_text ?? "";
  }
  const b = body as { generated_text?: string };
  return b.generated_text ?? "";
}

async function invokeModel(
  handle: {
    model: string;
    options: Record<string, unknown>;
    endpointUrl: string;
    apiKey: string;
  },
  inputs: string,
): Promise<string> {
  const http = httpOverride ?? sdkHttpRequest;
  const headers = buildHeaders(handle.apiKey);

  let url: string;
  if (handle.endpointUrl) {
    url = handle.endpointUrl;
  } else {
    url = `${DEFAULT_API_BASE}/models/${encodeURIComponent(handle.model)}`;
  }

  const body = buildGenerateBody(inputs, handle.options);
  const maxRetries = 2;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({ method: "POST", url, headers, body, timeoutMs: 120000 });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`HuggingFace request failed: ${lastError.message}`);
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

  throw lastError ?? new Error("HuggingFace request failed after retries");
}

export const lmOpenHuggingFaceInferenceExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "huggingFaceApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error(
      'HuggingFace Inference Model: credential "huggingFaceApi" is missing apiKey',
    );
  }

  const model = resolveString(ctx, "model", "");
  if (!model) {
    throw new Error("HuggingFace Inference Model: model id is required");
  }

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const endpointUrl = options.customInferenceEndpoint
    ? String(options.customInferenceEndpoint)
    : "";

  const handle: HuggingFaceModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmOpenHuggingFaceInference",
    model,
    options,
    endpointUrl,
    async invoke(messages: HuggingFaceChatMessage[]): Promise<{ text: string }> {
      const inputs = flattenMessages(messages);
      const text = await invokeModel({ model, options, endpointUrl, apiKey }, inputs);
      return { text };
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
