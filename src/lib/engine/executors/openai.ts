import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT = 120000;

export type OpenAiAppHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: OpenAiAppHttpClient | null = null;

export function setOpenAiAppHttpClient(factory: OpenAiAppHttpClient | null): void {
  httpOverride = factory;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
  cachedResultName?: string;
}

interface OpenAiCredentials {
  apiKey: string;
  organizationId?: string;
  baseUrl: string;
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

function resolveValue(
  ctx: ExecutionContext,
  value: unknown,
  itemJson: Record<string, unknown>,
): unknown {
  if (typeof value === "string" && value.startsWith("=")) {
    return ctx.evaluate(value, itemJson);
  }
  return value;
}

function resolveString(
  ctx: ExecutionContext,
  value: unknown,
  itemJson: Record<string, unknown>,
): string {
  const resolved = resolveValue(ctx, value, itemJson);
  return resolved == null ? "" : String(resolved);
}

function resolveModel(ctx: ExecutionContext, itemJson: Record<string, unknown>): string {
  const modelParam = ctx.getParam<unknown>("model");
  let raw: unknown = modelParam;
  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }
  if (raw == null || raw === "") {
    throw new Error("OpenAI: model is required");
  }
  const str = String(raw);
  const resolved = ctx.evaluate(str, itemJson);
  const modelId = String(resolved ?? "").trim();
  if (!modelId) {
    throw new Error("OpenAI: model resolved to empty");
  }
  return modelId;
}

interface ChatMessage {
  role: string;
  content: string;
}

function resolveMessages(ctx: ExecutionContext, itemJson: Record<string, unknown>): ChatMessage[] {
  const messagesParam = ctx.getParam<unknown>("messages");
  if (!messagesParam || typeof messagesParam !== "object") return [];
  const messageValues = (messagesParam as { messageValues?: unknown[] }).messageValues;
  if (!Array.isArray(messageValues)) return [];

  return messageValues.map((m) => {
    const msg = m as { role?: string; text?: string };
    const role = String(msg.role ?? "user");
    const content = resolveString(ctx, msg.text ?? "", itemJson);
    return { role, content };
  });
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error("OpenAI rate limit exceeded — the service is receiving too many requests.");
  }
  if (status === 402 || bodyStr.includes("insufficient_quota")) {
    return new Error(
      "OpenAI insufficient quota — check your organization, project, and billing settings.",
    );
  }
  return new Error(`OpenAI API error (${status}): ${bodyStr}`);
}

async function callApi(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<SdkHttpResponse> {
  const opts: SdkHttpRequestOptions = { method, url, headers, body, timeoutMs };

  if (httpOverride) {
    return httpOverride(opts);
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return fetchFormData(method, url, headers, body, timeoutMs);
  }

  return sdkHttpRequest(opts);
}

async function fetchFormData(
  method: string,
  url: string,
  headers: Record<string, string>,
  formData: FormData,
  timeoutMs: number,
): Promise<SdkHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body: formData, signal: controller.signal });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    return { status: res.status, headers: respHeaders, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function ensureOk(res: SdkHttpResponse): void {
  if (res.status < 200 || res.status >= 300) {
    throw classifyError(res.status, res.body);
  }
}

function simplifyChatCompletion(body: unknown): Record<string, unknown> {
  const b = body as {
    model?: string;
    choices?: Array<{ index?: number; message?: { role?: string; content?: string } }>;
  };
  return {
    model: b.model ?? "",
    choices: (b.choices ?? []).map((c) => ({
      index: c.index ?? 0,
      message: {
        role: c.message?.role ?? "assistant",
        content: c.message?.content ?? "",
      },
    })),
  };
}

function extractModerationResult(body: unknown): Record<string, unknown> {
  const b = body as { results?: Array<Record<string, unknown>> };
  return b.results?.[0] ?? { flagged: false, categories: {}, category_scores: {} };
}

function getBinaryFromItem(item: INodeExecutionData, fieldName: string): IBinaryData {
  const bin = item.binary?.[fieldName];
  if (!bin) {
    throw new Error(`OpenAI: binary property "${fieldName}" not found on item`);
  }
  return bin;
}

async function handleText(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  cred: OpenAiCredentials,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "chatCompletion");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const headers = buildHeaders(cred.apiKey, cred.organizationId);

  if (operation === "chatCompletion") {
    const model = resolveModel(ctx, item.json);
    const messages = resolveMessages(ctx, item.json);
    const simplifyOutput = ctx.getParam<boolean>("simplifyOutput", false);
    const outputContentAsJson = ctx.getParam<boolean>("outputContentAsJson", false);

    const body: Record<string, unknown> = { model, messages };
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.maxTokens != null) body.max_tokens = options.maxTokens;
    if (options.frequencyPenalty != null) body.frequency_penalty = options.frequencyPenalty;
    if (options.presencePenalty != null) body.presence_penalty = options.presencePenalty;
    if (options.topP != null) body.top_p = options.topP;
    if (options.numberOfCompletions != null) body.n = options.numberOfCompletions;
    if (outputContentAsJson) body.response_format = { type: "json_object" };

    const res = await callApi("POST", `${cred.baseUrl}/chat/completions`, headers, body, timeoutMs);
    ensureOk(res);

    const json = simplifyOutput
      ? simplifyChatCompletion(res.body)
      : (res.body as Record<string, unknown>);
    return { json, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "moderation") {
    const textInput = resolveString(ctx, ctx.getParam("textInput"), item.json);
    const useStableModel = ctx.getParam<boolean>("useStableModel", false);
    const model = useStableModel ? "text-moderation-stable" : "text-moderation-latest";

    const body: Record<string, unknown> = { input: textInput, model };
    if (options.temperature != null) body.temperature = options.temperature;

    const res = await callApi("POST", `${cred.baseUrl}/moderations`, headers, body, timeoutMs);
    ensureOk(res);

    const json = extractModerationResult(res.body);
    return { json, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "modelResponse") {
    // TODO: V2 Responses API (POST /responses) — conversationId, previousResponseId,
    // reasoningEffort, reasoningSummary, store, outputFormat, background, built-in tools.
    // Spec gap: exact request/response shape for V2 not fully enumerated in public docs.
    throw new Error("OpenAI: operation modelResponse (V2 Responses API) is not yet implemented");
  }

  throw new Error(`OpenAI: unknown text operation "${operation}"`);
}

async function handleImage(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  cred: OpenAiCredentials,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "analyze");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const headers = buildHeaders(cred.apiKey, cred.organizationId);

  if (operation === "generate") {
    const model = resolveModel(ctx, item.json);
    const prompt = resolveString(ctx, ctx.getParam("prompt"), item.json);
    const respondWithImageUrl = ctx.getParam<boolean>("respondWithImageUrl", false);

    const body: Record<string, unknown> = { model, prompt };
    if (options.quality) body.quality = options.quality;
    if (options.resolution) body.size = options.resolution;
    if (options.style) body.style = options.style;
    if (respondWithImageUrl) body.response_format = "url";

    const res = await callApi(
      "POST",
      `${cred.baseUrl}/images/generations`,
      headers,
      body,
      timeoutMs,
    );
    ensureOk(res);

    if (respondWithImageUrl) {
      return {
        json: res.body as Record<string, unknown>,
        pairedItem: { item: itemIndex, input: 0 },
      };
    }

    // TODO: binary extraction from b64_json response into putOutputField
    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "analyze") {
    // TODO: vision analysis via chat/completions with image_url input.
    // Spec gap: exact message format for image input (url vs binary) not fully specified.
    throw new Error("OpenAI: image operation analyze is not yet implemented");
  }

  if (operation === "edit") {
    // TODO: image edit via multipart /images/edits with image + mask.
    // Spec gap: multipart field names and gpt-image-1 specific options.
    throw new Error("OpenAI: image operation edit is not yet implemented");
  }

  throw new Error(`OpenAI: unknown image operation "${operation}"`);
}

async function handleAudio(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  cred: OpenAiCredentials,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "generate");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const headers = buildHeaders(cred.apiKey, cred.organizationId);

  if (operation === "transcribe" || operation === "translate") {
    const inputDataFieldName = ctx.getParam<string>("inputDataFieldName", "data");
    const bin = getBinaryFromItem(item, inputDataFieldName);

    const formData = new FormData();
    const blob = new Blob([Buffer.from(bin.data, "base64")], { type: bin.mimeType });
    formData.append("file", blob, bin.fileName ?? "audio");
    formData.append("model", "whisper-1");
    if (options.language) formData.append("language", String(options.language));
    if (options.temperature != null) formData.append("temperature", String(options.temperature));

    const endpoint = operation === "transcribe" ? "transcriptions" : "translations";
    const res = await callApi(
      "POST",
      `${cred.baseUrl}/audio/${endpoint}`,
      headers,
      formData,
      timeoutMs,
    );
    ensureOk(res);

    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "generate") {
    // TODO: TTS via POST /audio/speech — returns binary audio.
    // Requires binary response handling (sdkHttpRequest parses as text/JSON).
    throw new Error("OpenAI: audio operation generate (TTS) is not yet implemented");
  }

  throw new Error(`OpenAI: unknown audio operation "${operation}"`);
}

async function handleFile(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  cred: OpenAiCredentials,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "list");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const headers = buildHeaders(cred.apiKey, cred.organizationId);

  if (operation === "upload") {
    const inputDataFieldName = ctx.getParam<string>("inputDataFieldName", "data");
    const bin = getBinaryFromItem(item, inputDataFieldName);
    const purpose = ctx.getParam<string>("purpose") ?? (options.purpose as string) ?? "fine-tune";

    const formData = new FormData();
    const blob = new Blob([Buffer.from(bin.data, "base64")], { type: bin.mimeType });
    formData.append("file", blob, bin.fileName ?? "file");
    formData.append("purpose", purpose);

    const res = await callApi("POST", `${cred.baseUrl}/files`, headers, formData, timeoutMs);
    ensureOk(res);

    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "list") {
    const res = await callApi("GET", `${cred.baseUrl}/files`, headers, undefined, timeoutMs);
    ensureOk(res);

    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "delete") {
    const fileId = resolveString(ctx, ctx.getParam("fileId"), item.json);
    const res = await callApi(
      "DELETE",
      `${cred.baseUrl}/files/${encodeURIComponent(fileId)}`,
      headers,
      undefined,
      timeoutMs,
    );
    ensureOk(res);

    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  throw new Error(`OpenAI: unknown file operation "${operation}"`);
}

async function handleVideo(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  cred: OpenAiCredentials,
): Promise<INodeExecutionData> {
  // TODO: Sora video generation (POST /v1/videos).
  // Spec gap: exact endpoint and async polling flow not documented in public docs.
  throw new Error("OpenAI: video resource is not yet implemented");
}

async function handleConversation(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  cred: OpenAiCredentials,
): Promise<INodeExecutionData> {
  // TODO: Conversation operations (create, get, update, remove).
  // Spec gap: exact REST endpoints for conversation resource not documented in public docs.
  throw new Error("OpenAI: conversation resource is not yet implemented");
}

export const openAiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "openAiApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('OpenAI: credential "openAiApi" is missing apiKey');
  }
  const organizationId = credentials.organizationId
    ? String(credentials.organizationId)
    : undefined;
  const baseUrl = credentials.url ? String(credentials.url) : DEFAULT_BASE_URL;
  const cred: OpenAiCredentials = { apiKey, organizationId, baseUrl };

  const resource = ctx.getParam<string>("resource", "text");
  const items = ctx.getInputItems(0);
  const output: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: INodeExecutionData;
      switch (resource) {
        case "text":
          result = await handleText(ctx, item, i, cred);
          break;
        case "image":
          result = await handleImage(ctx, item, i, cred);
          break;
        case "audio":
          result = await handleAudio(ctx, item, i, cred);
          break;
        case "file":
          result = await handleFile(ctx, item, i, cred);
          break;
        case "video":
          result = await handleVideo(ctx, item, i, cred);
          break;
        case "conversation":
          result = await handleConversation(ctx, item, i, cred);
          break;
        default:
          throw new Error(`OpenAI: unknown resource "${resource}"`);
      }
      output.push(result);
    } catch (err) {
      if (ctx.continueOnFail()) {
        output.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: { item: i, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }

  return [output];
};
