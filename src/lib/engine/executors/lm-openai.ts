import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 2;

export interface OpenAiTextCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface OpenAiTextModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmOpenAi";
  model: string;
  options: Record<string, unknown>;
  baseUrl: string;
  invoke(prompt: string): Promise<OpenAiTextCompletionResult>;
}

export type OpenAiHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: OpenAiHttpClient | null = null;

export function setOpenAiHttpClient(factory: OpenAiHttpClient | null): void {
  httpOverride = factory;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
}

function resolveModelId(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("model");
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }

  if (raw == null || raw === "") {
    throw new Error("OpenAI Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("OpenAI Model: model id resolved to empty");
  }
  return modelId;
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

function buildCompletionsBody(
  model: string,
  prompt: string,
  options: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    prompt,
  };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.maxTokens != null) body.max_tokens = options.maxTokens;
  if (options.frequencyPenalty != null) body.frequency_penalty = options.frequencyPenalty;
  if (options.presencePenalty != null) body.presence_penalty = options.presencePenalty;
  if (options.topP != null) body.top_p = options.topP;
  return body;
}

function parseCompletionsResponse(body: unknown): OpenAiTextCompletionResult {
  const b = body as {
    choices?: Array<{
      text?: string;
    }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = b.choices?.[0]?.text ?? "";
  return {
    text: typeof text === "string" ? text : "",
    model: b.model ?? "",
    usage: {
      promptTokens: b.usage?.prompt_tokens ?? 0,
      completionTokens: b.usage?.completion_tokens ?? 0,
      totalTokens: b.usage?.total_tokens ?? 0,
    },
  };
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error(
      "OpenAI rate limit exceeded — the service is receiving too many requests.",
    );
  }
  if (status === 402 || bodyStr.includes("insufficient_quota")) {
    return new Error(
      "OpenAI insufficient quota — check your organization, project, and billing settings.",
    );
  }
  return new Error(`OpenAI API error (${status}): ${bodyStr}`);
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
    organizationId?: string;
  },
  prompt: string,
): Promise<OpenAiTextCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey, handle.organizationId);

  const url = `${handle.baseUrl}/completions`;
  const body = buildCompletionsBody(handle.model, prompt, handle.options);

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
      throw new Error(`OpenAI request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return parseCompletionsResponse(res.body);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("OpenAI request failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export const lmOpenAiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "openAiApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('OpenAI Model: credential "openAiApi" is missing apiKey');
  }
  const organizationId = credentials.organizationId
    ? String(credentials.organizationId)
    : undefined;

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const baseUrl = String(options.baseURL || credentials.url || DEFAULT_BASE_URL);
  const model = resolveModelId(ctx);

  const handle: OpenAiTextModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmOpenAi",
    model,
    options,
    baseUrl,
    invoke(prompt: string): Promise<OpenAiTextCompletionResult> {
      return invokeModel({ model, options, baseUrl, apiKey, organizationId }, prompt);
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