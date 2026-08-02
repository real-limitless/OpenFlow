import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

export interface AzureOpenAiChatMessage {
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

export interface AzureOpenAiToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AzureOpenAiCompletionResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: AzureOpenAiToolCall[];
}

export interface AzureOpenAiAgentToolDef {
  name: string;
  description?: string;
  schema?: unknown;
}

export interface AzureOpenAiModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatAzureOpenAi";
  model: string;
  options: Record<string, unknown>;
  invoke(
    messages: AzureOpenAiChatMessage[],
    tools?: AzureOpenAiAgentToolDef[] | unknown[],
  ): Promise<AzureOpenAiCompletionResult>;
}

export type AzureOpenAiHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: AzureOpenAiHttpClient | null = null;

export function setAzureOpenAiHttpClient(factory: AzureOpenAiHttpClient | null): void {
  httpOverride = factory;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
  cachedResultName?: string;
}

function resolveDeploymentId(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("model");
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }

  if (raw == null || raw === "") {
    throw new Error("Azure OpenAI Chat Model: model/deployment id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const deployment = String(resolved ?? "").trim();

  if (!deployment) {
    throw new Error("Azure OpenAI Chat Model: deployment id resolved to empty");
  }
  return deployment;
}

function serializeMessagesForApi(messages: AzureOpenAiChatMessage[]): unknown[] {
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

function normalizeAgentToolDefs(tools: unknown[] | undefined): AzureOpenAiAgentToolDef[] {
  if (!tools || tools.length === 0) return [];
  const out: AzureOpenAiAgentToolDef[] = [];
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

function mapAgentToolsToOpenAi(tools: AzureOpenAiAgentToolDef[]): unknown[] {
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

function buildRequestBody(
  model: string,
  messages: AzureOpenAiChatMessage[],
  options: Record<string, unknown>,
  agentTools?: AzureOpenAiAgentToolDef[],
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
  if (options.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }
  if (agentTools && agentTools.length > 0) {
    body.tools = mapAgentToolsToOpenAi(agentTools);
  }
  return body;
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error(
      "Azure OpenAI rate limit exceeded — reduce request frequency or increase quota.",
    );
  }
  if (status === 401) {
    return new Error(
      "Azure OpenAI: invalid or unauthorized API key. Check your credentials.",
    );
  }
  return new Error(`Azure OpenAI API error (${status}): ${bodyStr}`);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseCompletionResponse(body: unknown): AzureOpenAiCompletionResult {
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
  const toolCalls: AzureOpenAiToolCall[] = [];
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
    baseUrl: string;
    apiKey: string;
  },
  messages: AzureOpenAiChatMessage[],
  agentTools?: AzureOpenAiAgentToolDef[],
): Promise<AzureOpenAiCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const body = buildRequestBody(handle.model, messages, handle.options, agentTools);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await http({
        method: "POST",
        url: handle.baseUrl,
        headers: {
          "content-type": "application/json",
          "api-key": handle.apiKey,
        },
        body,
        timeoutMs: timeout,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Azure OpenAI request failed: ${lastError.message}`);
    }

    if (res.status >= 200 && res.status < 300) {
      return parseCompletionResponse(res.body);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Azure OpenAI request failed after retries");
}

export const lmChatAzureOpenAiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "azureOpenAiApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Azure OpenAI Chat Model: credential "azureOpenAiApi" is missing apiKey');
  }
  const resourceName = String(credentials.resourceName ?? "");
  if (!resourceName) {
    throw new Error('Azure OpenAI Chat Model: credential "azureOpenAiApi" missing resourceName');
  }
  const apiVersion = String(credentials.apiVersion ?? "");
  if (!apiVersion) {
    throw new Error('Azure OpenAI Chat Model: credential "azureOpenAiApi" missing apiVersion');
  }

  const deployment = resolveDeploymentId(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const baseUrl = `https://${resourceName}.openai.azure.com/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const handle: AzureOpenAiModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatAzureOpenAi",
    model: deployment,
    options,
    invoke(
      messages: AzureOpenAiChatMessage[],
      tools?: AzureOpenAiAgentToolDef[] | unknown[],
    ): Promise<AzureOpenAiCompletionResult> {
      const agentTools = normalizeAgentToolDefs(tools);
      return invokeModel({ model: deployment, options, baseUrl, apiKey }, messages, agentTools);
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
