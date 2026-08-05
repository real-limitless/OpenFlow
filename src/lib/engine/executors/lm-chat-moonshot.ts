import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.moonshot.ai/v1";
const DEFAULT_TIMEOUT = 360000;
const DEFAULT_MAX_RETRIES = 2;

export interface MoonshotChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface MoonshotCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface MoonshotModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatMoonshot";
  model: string;
  options: Record<string, unknown>;
  baseUrl: string;
  invoke(messages: MoonshotChatMessage[]): Promise<MoonshotCompletionResult>;
}

export type MoonshotHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: MoonshotHttpClient | null = null;

export function setMoonshotHttpClient(factory: MoonshotHttpClient | null): void {
  httpOverride = factory;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
  cachedResultName?: string;
}

function resolveModelId(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("model");
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }

  if (raw == null || raw === "") {
    throw new Error("Moonshot Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("Moonshot Chat Model: model id resolved to empty");
  }
  return modelId;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function buildChatCompletionsBody(
  model: string,
  messages: MoonshotChatMessage[],
  options: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.maxTokens != null && (options.maxTokens as number) !== -1) body.max_completion_tokens = options.maxTokens;
  if (options.frequencyPenalty != null) body.frequency_penalty = options.frequencyPenalty;
  if (options.presencePenalty != null) body.presence_penalty = options.presencePenalty;
  if (options.topP != null) body.top_p = options.topP;
  if (options.responseFormat != null) {
    const rf = String(options.responseFormat);
    if (rf === "json") {
      body.response_format = { type: "json_object" };
    } else if (rf === "json_schema") {
      body.response_format = { type: "json_schema" };
    } else {
      body.response_format = { type: "text" };
    }
  }
  return body;
}

function parseChatCompletionsResponse(body: unknown): MoonshotCompletionResult {
  const b = body as {
    choices?: Array<{
      message?: { content?: string | null };
    }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = b.choices?.[0]?.message?.content ?? "";
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
      "Moonshot rate limit exceeded — the service is receiving too many requests. Mitigate with batching or Wait nodes.",
    );
  }
  if (status === 401) {
    return new Error("Moonshot authentication error (401) — check your API key.");
  }
  return new Error(`Moonshot API error (${status}): ${bodyStr}`);
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
  },
  messages: MoonshotChatMessage[],
): Promise<MoonshotCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey);

  const url = `${handle.baseUrl}/chat/completions`;
  const body = buildChatCompletionsBody(handle.model, messages, handle.options);

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
      throw new Error(`Moonshot request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return parseChatCompletionsResponse(res.body);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Moonshot request failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export const lmChatMoonshotExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "moonshotApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Moonshot Chat Model: credential "moonshotApi" is missing apiKey');
  }

  const baseUrl = (credentials.baseUrl as string) || DEFAULT_BASE_URL;
  const model = resolveModelId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: MoonshotModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatMoonshot",
    model,
    options,
    baseUrl,
    invoke(messages: MoonshotChatMessage[]): Promise<MoonshotCompletionResult> {
      return invokeModel({ model, options, baseUrl, apiKey }, messages);
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
