import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const COHERE_API_BASE = "https://api.cohere.com/v2";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

export interface CohereChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface CohereToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface CohereCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: CohereToolCall[];
}

export interface CohereAgentToolDef {
  name: string;
  description?: string;
  schema?: unknown;
}

export interface CohereModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatCohere";
  model: string;
  options: Record<string, unknown>;
  invoke(messages: CohereChatMessage[], tools?: CohereAgentToolDef[] | unknown[]): Promise<CohereCompletionResult>;
}

export type CohereHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: CohereHttpClient | null = null;

export function setCohereHttpClient(factory: CohereHttpClient | null): void {
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
    throw new Error("Cohere Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("Cohere Chat Model: model id resolved to empty");
  }
  return modelId;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function serializeMessages(messages: CohereChatMessage[]): unknown[] {
  return messages.map((m) => {
    const msg: Record<string, unknown> = {
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content,
    };
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    if (m.tool_calls && m.tool_calls.length > 0) msg.tool_calls = m.tool_calls;
    return msg;
  });
}

function buildRequestBody(
  model: string,
  messages: CohereChatMessage[],
  options: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: serializeMessages(messages),
    stream: false,
  };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.maxTokens != null) body.max_tokens = options.maxTokens;
  return body;
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 401) {
    return new Error("Cohere API: invalid or unauthorized API key");
  }
  if (status === 429) {
    return new Error("Cohere rate limit exceeded");
  }
  if (status === 400) {
    return new Error(`Cohere API bad request (400): ${bodyStr}`);
  }
  return new Error(`Cohere API error (${status}): ${bodyStr}`);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseResponse(body: unknown): CohereCompletionResult {
  const b = body as {
    id?: string;
    finish_reason?: string;
    message?: {
      role?: string;
      content?: Array<{ type?: string; text?: string }>;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    usage?: {
      billed_units?: { input_tokens?: number; output_tokens?: number };
      tokens?: { input_tokens?: number; output_tokens?: number };
    };
  };

  const contentBlocks = b.message?.content ?? [];
  const text = Array.isArray(contentBlocks)
    ? contentBlocks
        .filter((c) => c.type === "text" || !c.type)
        .map((c) => c.text ?? "")
        .join("")
    : "";

  const toolCalls: CohereToolCall[] = [];
  for (const tc of b.message?.tool_calls ?? []) {
    const name = tc.function?.name;
    if (!name) continue;
    let args: Record<string, unknown> = {};
    if (tc.function?.arguments) {
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = { raw: tc.function.arguments };
      }
    }
    toolCalls.push({ id: tc.id, name, args });
  }

  return {
    text,
    model: "",
    usage: {
      promptTokens: b.usage?.tokens?.input_tokens ?? 0,
      completionTokens: b.usage?.tokens?.output_tokens ?? 0,
      totalTokens:
        (b.usage?.tokens?.input_tokens ?? 0) + (b.usage?.tokens?.output_tokens ?? 0),
    },
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

function parseAgentToolDefs(tools: unknown[] | undefined): CohereAgentToolDef[] {
  if (!tools || tools.length === 0) return [];
  const out: CohereAgentToolDef[] = [];
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function invokeModel(
  handle: {
    model: string;
    options: Record<string, unknown>;
    apiKey: string;
  },
  messages: CohereChatMessage[],
  agentTools?: CohereAgentToolDef[],
): Promise<CohereCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.apiKey);

  const url = `${COHERE_API_BASE}/chat`;
  const body = buildRequestBody(handle.model, messages, handle.options);

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
      throw new Error(`Cohere request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return parseResponse(res.body);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Cohere request failed after retries");
}

export const lmChatCohereExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "cohereApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Cohere Chat Model: credential "cohereApi" is missing apiKey');
  }

  const model = resolveModelId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: CohereModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatCohere",
    model,
    options,
    invoke(
      messages: CohereChatMessage[],
      tools?: CohereAgentToolDef[] | unknown[],
    ): Promise<CohereCompletionResult> {
      return invokeModel({ model, options, apiKey }, messages, parseAgentToolDefs(tools));
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
