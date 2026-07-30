import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

export interface GeminiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface GeminiCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface GeminiModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini";
  model: string;
  options: Record<string, unknown>;
  baseUrl: string;
  invoke(messages: GeminiChatMessage[]): Promise<GeminiCompletionResult>;
}

export type GeminiHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: GeminiHttpClient | null = null;

export function setGeminiHttpClient(factory: GeminiHttpClient | null): void {
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
    throw new Error("Google Gemini Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("Google Gemini Chat Model: model id resolved to empty");
  }
  return modelId;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "x-goog-api-key": apiKey,
    "content-type": "application/json",
  };
}

function mapMessagesToGemini(messages: GeminiChatMessage[]): {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
} {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;

  for (const msg of messages) {
    if (msg.role === "system") {
      if (!systemInstruction) {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        systemInstruction.parts.push({ text: msg.content });
      }
      continue;
    }
    if (msg.role === "tool") {
      // TODO: tool / function-calling role mapping is a spec gap — not implemented.
      continue;
    }
    const role = msg.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: msg.content }] });
  }

  return { contents, systemInstruction };
}

function buildGenerateContentBody(
  model: string,
  messages: GeminiChatMessage[],
  options: Record<string, unknown>,
): Record<string, unknown> {
  const { contents, systemInstruction } = mapMessagesToGemini(messages);

  const body: Record<string, unknown> = { contents };
  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const generationConfig: Record<string, unknown> = {};
  if (options.temperature != null) generationConfig.temperature = options.temperature;
  if (options.maxOutputTokens != null) generationConfig.maxOutputTokens = options.maxOutputTokens;
  if (options.topP != null) generationConfig.topP = options.topP;
  if (options.topK != null) generationConfig.topK = options.topK;
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  if (options.safetySettings != null) {
    // TODO: nested per-category threshold wire schema is a spec gap — pass through as-is.
    body.safetySettings = options.safetySettings;
  }

  return body;
}

function parseGenerateContentResponse(body: unknown, model: string): GeminiCompletionResult {
  const b = body as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const parts = b.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  return {
    text,
    model,
    usage: {
      promptTokens: b.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: b.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: b.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error(
      "Google Gemini rate limit exceeded — the service is receiving too many requests. Mitigate with batching or Wait nodes.",
    );
  }
  if (status === 400) {
    return new Error(`Google Gemini bad request (400): ${bodyStr}`);
  }
  if (status === 401 || status === 403) {
    return new Error(
      `Google Gemini authentication error (${status}) — check your API key. ${bodyStr}`,
    );
  }
  return new Error(`Google Gemini API error (${status}): ${bodyStr}`);
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
  messages: GeminiChatMessage[],
): Promise<GeminiCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey);

  const url = `${handle.baseUrl}/models/${handle.model}:generateContent`;
  const body = buildGenerateContentBody(handle.model, messages, handle.options);

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
      throw new Error(`Google Gemini request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return parseGenerateContentResponse(res.body, handle.model);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Google Gemini request failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export const lmChatGoogleGeminiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "googleApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Google Gemini Chat Model: credential "googleApi" is missing apiKey');
  }
  const baseUrl = credentials.host ? String(credentials.host) : DEFAULT_BASE_URL;

  const model = resolveModelId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: GeminiModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
    model,
    options,
    baseUrl,
    invoke(messages: GeminiChatMessage[]): Promise<GeminiCompletionResult> {
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