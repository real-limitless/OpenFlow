import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";
import { STREAM_FIRST_CHUNK_MS, STREAM_GAP_MS } from "../llm-silence";
import {
  consumeOpenRouterSse,
  isStreamRejected,
  iterateByteStream,
  iterateSseText,
  looksLikeChatCompletion,
  looksLikeSse,
  OpenRouterStreamSilentError,
  type OpenRouterStreamDelta,
} from "./openrouter-sse";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT = 900000;
const DEFAULT_MAX_RETRIES = 4;

export interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  name?: string;
}

export interface OpenRouterToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface OpenRouterAgentToolDef {
  name: string;
  description?: string;
  schema?: unknown;
  parameters?: unknown;
}

export interface OpenRouterCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: OpenRouterToolCall[];
  reasoning?: string;
}

export type OpenRouterInvokeOptions = {
  onDelta?: (delta: OpenRouterStreamDelta) => void;
};

export interface OpenRouterModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter";
  model: string;
  options: Record<string, unknown>;
  baseUrl: string;
  invoke(
    messages: OpenRouterChatMessage[],
    tools?: OpenRouterAgentToolDef[] | unknown[],
    opts?: OpenRouterInvokeOptions,
  ): Promise<OpenRouterCompletionResult>;
}

export type OpenRouterHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: OpenRouterHttpClient | null = null;

export function setOpenRouterHttpClient(factory: OpenRouterHttpClient | null): void {
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
    throw new Error("OpenRouter Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("OpenRouter Chat Model: model id resolved to empty");
  }
  return modelId;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function mapResponseFormat(responseFormat: unknown): Record<string, string> | undefined {
  if (responseFormat == null || responseFormat === "") return undefined;
  const value = String(responseFormat);
  if (value === "json") return { type: "json_object" };
  if (value === "text") return { type: "text" };
  return undefined;
}

function normalizeAgentToolDefs(tools: unknown[] | undefined): OpenRouterAgentToolDef[] {
  if (!tools || tools.length === 0) return [];
  const out: OpenRouterAgentToolDef[] = [];
  for (const t of tools) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.name) continue;
    out.push({
      name: o.name,
      description: typeof o.description === "string" ? o.description : undefined,
      schema: o.schema ?? o.parameters,
    });
  }
  return out;
}

function mapAgentTools(tools: OpenRouterAgentToolDef[]): unknown[] {
  return tools.map((t) => {
    const parameters =
      t.schema && typeof t.schema === "object" ? t.schema : { type: "object", properties: {} };
    return {
      type: "function",
      function: {
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        parameters,
      },
    };
  });
}

function serializeMessages(messages: OpenRouterChatMessage[]): unknown[] {
  return messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role, content: m.content ?? "" };
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.tool_calls && m.tool_calls.length > 0) msg.tool_calls = m.tool_calls;
    if (m.name) msg.name = m.name;
    if (m.role === "assistant" && (!m.content || m.content === "") && m.tool_calls?.length) {
      msg.content = null;
    }
    return msg;
  });
}

function parseToolCallArguments(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { raw };
    }
  }
  return { value: raw };
}

function buildChatCompletionsBody(
  model: string,
  messages: OpenRouterChatMessage[],
  options: Record<string, unknown>,
  agentTools?: OpenRouterAgentToolDef[],
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, messages: serializeMessages(messages) };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.maxTokens != null) body.max_tokens = options.maxTokens;
  if (options.frequencyPenalty != null) body.frequency_penalty = options.frequencyPenalty;
  if (options.presencePenalty != null) body.presence_penalty = options.presencePenalty;
  if (options.topP != null) body.top_p = options.topP;
  const responseFormat = mapResponseFormat(options.responseFormat);
  if (responseFormat) body.response_format = responseFormat;
  if (agentTools && agentTools.length > 0) {
    body.tools = mapAgentTools(agentTools);
    body.tool_choice = "auto";
  }
  return body;
}

function parseChatCompletionsResponse(body: unknown): OpenRouterCompletionResult {
  const b = body as {
    choices?: Array<{
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
        reasoning?: string | null;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const message = b.choices?.[0]?.message;
  const text = message?.content ?? "";
  const reasoningRaw = message?.reasoning_content ?? message?.reasoning;
  const reasoning =
    typeof reasoningRaw === "string" && reasoningRaw.length > 0 ? reasoningRaw : undefined;
  const toolCalls: OpenRouterToolCall[] = [];
  for (const tc of message?.tool_calls ?? []) {
    const name = tc.function?.name;
    if (!name) continue;
    toolCalls.push({
      id: tc.id,
      name,
      args: parseToolCallArguments(tc.function?.arguments),
    });
  }
  return {
    text: typeof text === "string" ? text : "",
    model: b.model ?? "",
    usage: {
      promptTokens: b.usage?.prompt_tokens ?? 0,
      completionTokens: b.usage?.completion_tokens ?? 0,
      totalTokens: b.usage?.total_tokens ?? 0,
    },
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error(
      "OpenRouter rate limit exceeded — the service is receiving too many requests. Mitigate with batching or Wait nodes.",
    );
  }
  if (status === 402) {
    return new Error(
      "OpenRouter insufficient credits — check your account billing and credit balance.",
    );
  }
  if (status === 401 || status === 403) {
    return new Error(
      `OpenRouter authentication error (${status}) — check your API key. ${bodyStr}`,
    );
  }
  return new Error(`OpenRouter API error (${status}): ${bodyStr}`);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function streamEnabled(options: Record<string, unknown>): boolean {
  return options.stream !== false;
}

function streamTimeouts(options: Record<string, unknown>): {
  firstChunkMs: number;
  gapMs: number;
} {
  return {
    firstChunkMs:
      typeof options.streamFirstChunkMs === "number" && options.streamFirstChunkMs > 0
        ? options.streamFirstChunkMs
        : STREAM_FIRST_CHUNK_MS,
    gapMs:
      typeof options.streamGapMs === "number" && options.streamGapMs > 0
        ? options.streamGapMs
        : STREAM_GAP_MS,
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<SdkHttpResponse> {
  const http = httpOverride ?? sdkHttpRequest;
  return http({ method: "POST", url, headers, body, timeoutMs });
}

async function invokeViaNativeStream(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number,
  onDelta: OpenRouterInvokeOptions["onDelta"],
  firstChunkMs: number,
  gapMs: number,
): Promise<
  | { ok: true; result: OpenRouterCompletionResult }
  | { ok: false; status: number; body: unknown; retryNonStream: boolean }
> {
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, accept: "text/event-stream, application/json" },
      body: JSON.stringify({
        ...body,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* keep text */
      }
      return {
        ok: false,
        status: res.status,
        body: parsed,
        retryNonStream: isStreamRejected(res.status, parsed),
      };
    }
    if (ct.includes("application/json") && !ct.includes("event-stream")) {
      const json = await res.json();
      if (looksLikeChatCompletion(json)) {
        return { ok: true, result: parseChatCompletionsResponse(json) };
      }
      return { ok: false, status: res.status, body: json, retryNonStream: true };
    }
    if (!res.body) {
      return { ok: false, status: res.status, body: "empty body", retryNonStream: true };
    }
    const result = await consumeOpenRouterSse(iterateByteStream(res.body.getReader()), {
      firstChunkMs,
      gapMs,
      onDelta,
    });
    return { ok: true, result };
  } catch (err) {
    if (err instanceof OpenRouterStreamSilentError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`OpenRouter request failed: ${message}`);
  } finally {
    clearTimeout(hardTimer);
  }
}

async function invokeModel(
  handle: {
    model: string;
    options: Record<string, unknown>;
    baseUrl: string;
    apiKey: string;
  },
  messages: OpenRouterChatMessage[],
  tools?: unknown[],
  invokeOpts?: OpenRouterInvokeOptions,
): Promise<OpenRouterCompletionResult> {
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey);
  const url = `${handle.baseUrl}/chat/completions`;
  const body = buildChatCompletionsBody(
    handle.model,
    messages,
    handle.options,
    normalizeAgentToolDefs(tools),
  );
  const wantStream = streamEnabled(handle.options);
  const { firstChunkMs, gapMs } = streamTimeouts(handle.options);

  let lastError: Error | null = null;
  let triedNonStream = !wantStream;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (wantStream && httpOverride) {
        const res = await postJson(
          url,
          headers,
          { ...body, stream: true, stream_options: { include_usage: true } },
          timeout,
        );
        if (res.status >= 200 && res.status < 300) {
          if (looksLikeChatCompletion(res.body)) {
            return parseChatCompletionsResponse(res.body);
          }
          if (looksLikeSse(res.body)) {
            return await consumeOpenRouterSse(iterateSseText(res.body), {
              firstChunkMs,
              gapMs,
              onDelta: invokeOpts?.onDelta,
            });
          }
        }
        if (isStreamRejected(res.status, res.body) && !triedNonStream) {
          triedNonStream = true;
          const fallback = await postJson(url, headers, body, timeout);
          if (fallback.status >= 200 && fallback.status < 300) {
            return parseChatCompletionsResponse(fallback.body);
          }
          lastError = classifyError(fallback.status, fallback.body);
          if (isRetryable(fallback.status) && attempt < maxRetries) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw lastError;
        }
        lastError = classifyError(res.status, res.body);
        if (isRetryable(res.status) && attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      if (wantStream && !httpOverride) {
        const streamed = await invokeViaNativeStream(
          url,
          headers,
          body,
          timeout,
          invokeOpts?.onDelta,
          firstChunkMs,
          gapMs,
        );
        if (streamed.ok) return streamed.result;
        if (streamed.retryNonStream && !triedNonStream) {
          triedNonStream = true;
          const fallback = await postJson(url, headers, body, timeout);
          if (fallback.status >= 200 && fallback.status < 300) {
            return parseChatCompletionsResponse(fallback.body);
          }
          lastError = classifyError(fallback.status, fallback.body);
          if (isRetryable(fallback.status) && attempt < maxRetries) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw lastError;
        }
        lastError = classifyError(streamed.status, streamed.body);
        if (isRetryable(streamed.status) && attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      const res = await postJson(url, headers, body, timeout);
      if (res.status >= 200 && res.status < 300) {
        return parseChatCompletionsResponse(res.body);
      }
      lastError = classifyError(res.status, res.body);
      if (isRetryable(res.status) && attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    } catch (err) {
      if (err instanceof OpenRouterStreamSilentError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.startsWith("OpenRouter API error")) throw lastError;
      if (lastError.message.startsWith("OpenRouter rate limit")) throw lastError;
      if (lastError.message.startsWith("OpenRouter insufficient")) throw lastError;
      if (lastError.message.startsWith("OpenRouter authentication")) throw lastError;
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError.message.startsWith("OpenRouter request failed")
        ? lastError
        : new Error(`OpenRouter request failed: ${lastError.message}`);
    }
  }

  throw lastError ?? new Error("OpenRouter request failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export const lmChatOpenRouterExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "openRouterApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('OpenRouter Chat Model: credential "openRouterApi" is missing apiKey');
  }
  const baseUrl = credentials.baseUrl ? String(credentials.baseUrl) : DEFAULT_BASE_URL;

  const model = resolveModelId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: OpenRouterModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter",
    model,
    options,
    baseUrl,
    invoke(
      messages: OpenRouterChatMessage[],
      tools?: OpenRouterAgentToolDef[] | unknown[],
      opts?: OpenRouterInvokeOptions,
    ): Promise<OpenRouterCompletionResult> {
      return invokeModel({ model, options, baseUrl, apiKey }, messages, tools, opts);
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
