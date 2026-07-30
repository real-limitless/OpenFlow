import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;
const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface AnthropicCompletionResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AnthropicModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatAnthropic";
  model: string;
  options: Record<string, unknown>;
  baseUrl: string;
  invoke(messages: AnthropicChatMessage[]): Promise<AnthropicCompletionResult>;
}

export type AnthropicHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: AnthropicHttpClient | null = null;

export function setAnthropicHttpClient(factory: AnthropicHttpClient | null): void {
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
    throw new Error("Anthropic Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("Anthropic Chat Model: model id resolved to empty");
  }
  return modelId;
}

function buildHeaders(
  apiKey: string,
  customHeader?: { name: string; value: string },
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
  if (customHeader?.name && customHeader.value != null) {
    headers[customHeader.name] = String(customHeader.value);
  }
  return headers;
}

function mapMessagesToAnthropic(messages: AnthropicChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  const systemParts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
      continue;
    }
    if (msg.role === "tool") {
      // TODO: tool-result content-block mapping is a spec gap — not implemented.
      continue;
    }
    out.push({ role: msg.role, content: msg.content });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: out,
  };
}

function buildMessagesBody(
  model: string,
  messages: AnthropicChatMessage[],
  options: Record<string, unknown>,
): Record<string, unknown> {
  const { system, messages: mapped } = mapMessagesToAnthropic(messages);

  if (options.maxTokens == null) {
    throw new Error(
      "Anthropic Chat Model: options.maxTokens is required (Anthropic API requires max_tokens)",
    );
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens,
    messages: mapped,
  };
  if (system != null) body.system = system;
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.topK != null) body.top_k = options.topK;
  if (options.topP != null) body.top_p = options.topP;
  return body;
}

function parseMessagesResponse(body: unknown): AnthropicCompletionResult {
  const b = body as {
    content?: Array<{ type?: string; text?: string }>;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (b.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  return {
    text,
    model: b.model ?? "",
    usage: {
      inputTokens: b.usage?.input_tokens ?? 0,
      outputTokens: b.usage?.output_tokens ?? 0,
    },
  };
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error(
      "Anthropic rate limit exceeded — the service is receiving too many requests. Mitigate with batching or Wait nodes.",
    );
  }
  if (status === 401 || status === 403) {
    return new Error(`Anthropic authentication error (${status}) — check your API key. ${bodyStr}`);
  }
  if (status === 400) {
    return new Error(`Anthropic bad request (400): ${bodyStr}`);
  }
  return new Error(`Anthropic API error (${status}): ${bodyStr}`);
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
    customHeader?: { name: string; value: string };
  },
  messages: AnthropicChatMessage[],
): Promise<AnthropicCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey, handle.customHeader);

  const url = `${handle.baseUrl}/v1/messages`;
  const body = buildMessagesBody(handle.model, messages, handle.options);

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
      throw new Error(`Anthropic request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return parseMessagesResponse(res.body);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Anthropic request failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export const lmChatAnthropicExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "anthropicApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Anthropic Chat Model: credential "anthropicApi" is missing apiKey');
  }
  const baseUrl = credentials.baseUrl ? String(credentials.baseUrl) : DEFAULT_BASE_URL;

  let customHeader: { name: string; value: string } | undefined;
  if (credentials.header) {
    const name = String(credentials.headerName ?? "").trim();
    const value = String(credentials.headerValue ?? "");
    if (name) {
      customHeader = { name, value };
    }
  }

  const model = resolveModelId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: AnthropicModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatAnthropic",
    model,
    options,
    baseUrl,
    invoke(messages: AnthropicChatMessage[]): Promise<AnthropicCompletionResult> {
      return invokeModel({ model, options, baseUrl, apiKey, customHeader }, messages);
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
