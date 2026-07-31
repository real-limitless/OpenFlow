import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

export interface OpenAiChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  name?: string;
}

export interface OpenAiToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface OpenAiCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: OpenAiToolCall[];
}

export interface OpenAiAgentToolDef {
  name: string;
  description?: string;
  schema?: unknown;
}

export interface OpenAiModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatOpenAi";
  model: string;
  responsesApiEnabled: boolean;
  options: Record<string, unknown>;
  builtInTools: Record<string, unknown>;
  baseUrl: string;
  invoke(
    messages: OpenAiChatMessage[],
    tools?: OpenAiAgentToolDef[] | unknown[],
  ): Promise<OpenAiCompletionResult>;
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
  cachedResultName?: string;
}

function resolveModelId(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("model");
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }

  if (raw == null || raw === "") {
    throw new Error("OpenAI Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("OpenAI Chat Model: model id resolved to empty");
  }
  return modelId;
}

function resolveBuiltInTools(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
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

function mapBuiltInToolsToOpenAi(builtInTools: Record<string, unknown>): unknown[] {
  const tools: unknown[] = [];
  const webSearch = builtInTools.webSearch;
  if (webSearch && typeof webSearch === "object") {
    const ws = webSearch as { searchContextSize?: string };
    tools.push({
      type: "web_search_preview",
      ...(ws.searchContextSize ? { search_context_size: ws.searchContextSize } : {}),
    });
  }
  if (builtInTools.fileSearch) {
    tools.push({ type: "file_search" });
  }
  if (builtInTools.codeInterpreter) {
    tools.push({ type: "code_interpreter" });
  }
  return tools;
}

function normalizeAgentToolDefs(tools: unknown[] | undefined): OpenAiAgentToolDef[] {
  if (!tools || tools.length === 0) return [];
  const out: OpenAiAgentToolDef[] = [];
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

function mapAgentToolsToOpenAi(tools: OpenAiAgentToolDef[]): unknown[] {
  return tools.map((t) => {
    const parameters =
      t.schema && typeof t.schema === "object"
        ? t.schema
        : { type: "object", properties: {} };
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

function serializeMessagesForApi(messages: OpenAiChatMessage[]): unknown[] {
  return messages.map((m) => {
    const msg: Record<string, unknown> = {
      role: m.role,
      content: m.content ?? "",
    };
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.tool_calls && m.tool_calls.length > 0) msg.tool_calls = m.tool_calls;
    if (m.name) msg.name = m.name;
    if (m.role === "assistant" && (!m.content || m.content === "") && m.tool_calls?.length) {
      msg.content = null;
    }
    return msg;
  });
}

function buildChatCompletionsBody(
  model: string,
  messages: OpenAiChatMessage[],
  options: Record<string, unknown>,
  agentTools?: OpenAiAgentToolDef[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: serializeMessagesForApi(messages),
  };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.maxTokens != null) body.max_tokens = options.maxTokens;
  if (options.frequencyPenalty != null) body.frequency_penalty = options.frequencyPenalty;
  if (options.presencePenalty != null) body.presence_penalty = options.presencePenalty;
  if (options.topP != null) body.top_p = options.topP;
  if (agentTools && agentTools.length > 0) {
    body.tools = mapAgentToolsToOpenAi(agentTools);
  }
  return body;
}

function buildResponsesBody(
  model: string,
  messages: OpenAiChatMessage[],
  options: Record<string, unknown>,
  builtInTools: Record<string, unknown>,
  agentTools?: OpenAiAgentToolDef[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    input: serializeMessagesForApi(messages),
  };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.maxTokens != null) body.max_output_tokens = options.maxTokens;
  if (options.topP != null) body.top_p = options.topP;
  if (options.conversationId) body.conversation = options.conversationId;
  if (options.promptCacheKey) body.prompt_cache_key = options.promptCacheKey;
  if (options.safetyIdentifier) body.safety_identifier = options.safetyIdentifier;
  if (options.serviceTier) body.service_tier = options.serviceTier;
  if (options.metadata) body.metadata = options.metadata;
  if (options.topLogprobs != null) body.top_logprobs = options.topLogprobs;

  const tools = [
    ...mapBuiltInToolsToOpenAi(builtInTools),
    ...mapAgentToolsToOpenAi(agentTools ?? []),
  ];
  if (tools.length > 0) body.tools = tools;
  return body;
}

function parseToolCallArguments(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
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

function parseChatCompletionsResponse(body: unknown): OpenAiCompletionResult {
  const b = body as {
    choices?: Array<{
      message?: {
        content?: string | null;
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
  const toolCalls: OpenAiToolCall[] = [];
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
  };
}

function parseResponsesResponse(body: unknown): OpenAiCompletionResult {
  const b = body as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
      name?: string;
      arguments?: string | Record<string, unknown>;
      call_id?: string;
      id?: string;
    }>;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };

  let text = b.output_text ?? "";
  const toolCalls: OpenAiToolCall[] = [];

  if (Array.isArray(b.output)) {
    const textParts: string[] = [];
    for (const item of b.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text" && typeof part.text === "string") {
            textParts.push(part.text);
          } else if (typeof part.text === "string") {
            textParts.push(part.text);
          }
        }
      }
      if (
        item.type === "function_call" ||
        item.type === "tool_call" ||
        (item.name && (item.arguments != null || item.call_id))
      ) {
        if (typeof item.name === "string" && item.name) {
          toolCalls.push({
            id: item.call_id ?? item.id,
            name: item.name,
            args: parseToolCallArguments(item.arguments),
          });
        }
      }
    }
    if (!text && textParts.length > 0) text = textParts.join("");
  }

  return {
    text,
    model: b.model ?? "",
    usage: {
      promptTokens: b.usage?.input_tokens ?? 0,
      completionTokens: b.usage?.output_tokens ?? 0,
      totalTokens: b.usage?.total_tokens ?? 0,
    },
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error(
      "OpenAI rate limit exceeded — the service is receiving too many requests. Mitigate with batching or Wait nodes.",
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
    responsesApiEnabled: boolean;
    options: Record<string, unknown>;
    builtInTools: Record<string, unknown>;
    baseUrl: string;
    apiKey: string;
    organizationId?: string;
  },
  messages: OpenAiChatMessage[],
  agentTools?: OpenAiAgentToolDef[],
): Promise<OpenAiCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey, handle.organizationId);

  const useResponses = handle.responsesApiEnabled;
  const url = useResponses ? `${handle.baseUrl}/responses` : `${handle.baseUrl}/chat/completions`;
  const body = useResponses
    ? buildResponsesBody(
        handle.model,
        messages,
        handle.options,
        handle.builtInTools,
        agentTools,
      )
    : buildChatCompletionsBody(handle.model, messages, handle.options, agentTools);

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
      return useResponses
        ? parseResponsesResponse(res.body)
        : parseChatCompletionsResponse(res.body);
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

export const lmChatOpenAiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "openAiApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('OpenAI Chat Model: credential "openAiApi" is missing apiKey');
  }
  const organizationId = credentials.organizationId
    ? String(credentials.organizationId)
    : undefined;
  const baseUrl = credentials.url ? String(credentials.url) : DEFAULT_BASE_URL;

  const model = resolveModelId(ctx);
  const responsesApiEnabled = ctx.getParam<boolean>("responsesApiEnabled", false);
  const builtInTools = resolveBuiltInTools(ctx.getParam("builtInTools"));
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: OpenAiModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model,
    responsesApiEnabled,
    options,
    builtInTools,
    baseUrl,
    invoke(
      messages: OpenAiChatMessage[],
      tools?: OpenAiAgentToolDef[] | unknown[],
    ): Promise<OpenAiCompletionResult> {
      const agentTools = normalizeAgentToolDefs(tools);
      return invokeModel(
        { model, responsesApiEnabled, options, builtInTools, baseUrl, apiKey, organizationId },
        messages,
        agentTools,
      );
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
