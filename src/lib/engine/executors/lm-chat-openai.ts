import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

export interface OpenAiChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer";
  content: string;
}

export interface OpenAiCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface OpenAiModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatOpenAi";
  model: string;
  responsesApiEnabled: boolean;
  options: Record<string, unknown>;
  builtInTools: Record<string, unknown>;
  baseUrl: string;
  invoke(messages: OpenAiChatMessage[]): Promise<OpenAiCompletionResult>;
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
    // TODO: nested file-search fields (vector store ids) are a spec gap
    tools.push({ type: "file_search" });
  }
  if (builtInTools.codeInterpreter) {
    // TODO: nested code-interpreter fields are a spec gap
    tools.push({ type: "code_interpreter" });
  }
  return tools;
}

function buildChatCompletionsBody(
  model: string,
  messages: OpenAiChatMessage[],
  options: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, messages };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.maxTokens != null) body.max_tokens = options.maxTokens;
  if (options.frequencyPenalty != null) body.frequency_penalty = options.frequencyPenalty;
  if (options.presencePenalty != null) body.presence_penalty = options.presencePenalty;
  if (options.topP != null) body.top_p = options.topP;
  return body;
}

function buildResponsesBody(
  model: string,
  messages: OpenAiChatMessage[],
  options: Record<string, unknown>,
  builtInTools: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, input: messages };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.maxTokens != null) body.max_output_tokens = options.maxTokens;
  if (options.topP != null) body.top_p = options.topP;
  if (options.conversationId) body.conversation = options.conversationId;
  if (options.promptCacheKey) body.prompt_cache_key = options.promptCacheKey;
  if (options.safetyIdentifier) body.safety_identifier = options.safetyIdentifier;
  if (options.serviceTier) body.service_tier = options.serviceTier;
  if (options.metadata) body.metadata = options.metadata;
  if (options.topLogprobs != null) body.top_logprobs = options.topLogprobs;

  const tools = mapBuiltInToolsToOpenAi(builtInTools);
  if (tools.length > 0) body.tools = tools;
  return body;
}

function parseChatCompletionsResponse(body: unknown): OpenAiCompletionResult {
  const b = body as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = b.choices?.[0]?.message?.content ?? "";
  return {
    text,
    model: b.model ?? "",
    usage: {
      promptTokens: b.usage?.prompt_tokens ?? 0,
      completionTokens: b.usage?.completion_tokens ?? 0,
      totalTokens: b.usage?.total_tokens ?? 0,
    },
  };
}

function parseResponsesResponse(body: unknown): OpenAiCompletionResult {
  const b = body as {
    output_text?: string;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };
  return {
    text: b.output_text ?? "",
    model: b.model ?? "",
    usage: {
      promptTokens: b.usage?.input_tokens ?? 0,
      completionTokens: b.usage?.output_tokens ?? 0,
      totalTokens: b.usage?.total_tokens ?? 0,
    },
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
): Promise<OpenAiCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey, handle.organizationId);

  const useResponses = handle.responsesApiEnabled;
  const url = useResponses ? `${handle.baseUrl}/responses` : `${handle.baseUrl}/chat/completions`;
  const body = useResponses
    ? buildResponsesBody(handle.model, messages, handle.options, handle.builtInTools)
    : buildChatCompletionsBody(handle.model, messages, handle.options);

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
    invoke(messages: OpenAiChatMessage[]): Promise<OpenAiCompletionResult> {
      return invokeModel(
        { model, responsesApiEnabled, options, builtInTools, baseUrl, apiKey, organizationId },
        messages,
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
