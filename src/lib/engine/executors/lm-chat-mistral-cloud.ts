import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.mistral.ai/v1";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

export interface MistralChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface MistralToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface MistralCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: MistralToolCall[];
}

export interface MistralAgentToolDef {
  name: string;
  description?: string;
  schema?: unknown;
}

export interface MistralModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatMistralCloud";
  model: string;
  options: Record<string, unknown>;
  invoke(
    messages: MistralChatMessage[],
    tools?: MistralAgentToolDef[] | unknown[],
  ): Promise<MistralCompletionResult>;
}

export type MistralHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: MistralHttpClient | null = null;

export function setMistralHttpClient(factory: MistralHttpClient | null): void {
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
    throw new Error("Mistral Cloud Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("Mistral Cloud Chat Model: model id resolved to empty");
  }
  return modelId;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function normalizeAgentToolDefs(tools: unknown[] | undefined): MistralAgentToolDef[] {
  if (!tools || tools.length === 0) return [];
  const out: MistralAgentToolDef[] = [];
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

function mapAgentToolsToMistral(tools: MistralAgentToolDef[]): unknown[] {
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

function serializeMessagesForApi(messages: MistralChatMessage[]): unknown[] {
  return messages.map((m) => {
    const msg: Record<string, unknown> = {
      role: m.role,
      content: m.content ?? "",
    };
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.tool_calls && m.tool_calls.length > 0) msg.tool_calls = m.tool_calls;
    return msg;
  });
}

function buildRequestBody(
  model: string,
  messages: MistralChatMessage[],
  options: Record<string, unknown>,
  agentTools?: MistralAgentToolDef[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: serializeMessagesForApi(messages),
  };

  if (options.maxTokens != null) body.max_tokens = options.maxTokens;
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.topP != null) body.top_p = options.topP;
  if (options.safeMode != null) body.safe_prompt = options.safeMode;
  if (options.randomSeed != null) body.random_seed = options.randomSeed;
  if (options.stop != null) body.stop = options.stop;

  if (agentTools && agentTools.length > 0) {
    body.tools = mapAgentToolsToMistral(agentTools);
  }
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

function parseChatCompletionsResponse(body: unknown): MistralCompletionResult {
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
  const toolCalls: MistralToolCall[] = [];
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

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error(
      "Mistral rate limit exceeded — the service is receiving too many requests. Mitigate with batching or Wait nodes.",
    );
  }
  return new Error(`Mistral API error (${status}): ${bodyStr}`);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function invokeModel(
  handle: {
    model: string;
    options: Record<string, unknown>;
    apiKey: string;
  },
  messages: MistralChatMessage[],
  agentTools?: MistralAgentToolDef[],
): Promise<MistralCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey);

  const url = `${DEFAULT_BASE_URL}/chat/completions`;
  const body = buildRequestBody(handle.model, messages, handle.options, agentTools);

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
      throw new Error(`Mistral request failed: ${lastError.message}`);
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

  throw lastError ?? new Error("Mistral request failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export const lmChatMistralCloudExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "mistralCloudApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Mistral Cloud Chat Model: credential "mistralCloudApi" is missing apiKey');
  }

  const model = resolveModelId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: MistralModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatMistralCloud",
    model,
    options,
    invoke(
      messages: MistralChatMessage[],
      tools?: MistralAgentToolDef[] | unknown[],
    ): Promise<MistralCompletionResult> {
      const agentTools = normalizeAgentToolDefs(tools);
      return invokeModel({ model, options, apiKey }, messages, agentTools);
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
