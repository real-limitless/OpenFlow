import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT = 120000;

export type GoogleGeminiHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: GoogleGeminiHttpClient | null = null;

export function setGoogleGeminiHttpClient(factory: GoogleGeminiHttpClient | null): void {
  httpOverride = factory;
}

function resolveString(
  ctx: ExecutionContext,
  value: unknown,
  itemJson: Record<string, unknown>,
): string {
  if (typeof value === "string" && value.startsWith("=")) {
    return String(ctx.evaluate(value, itemJson) ?? "");
  }
  return value == null ? "" : String(value);
}

function resolveModel(ctx: ExecutionContext, itemJson: Record<string, unknown>): string {
  const modelParam = ctx.getParam<unknown>("model");
  const raw = modelParam;
  if (raw == null || raw === "") {
    throw new Error("Google Gemini: model is required");
  }
  const str = String(raw);
  const resolved = ctx.evaluate(str, itemJson);
  const modelId = String(resolved ?? "").trim();
  if (!modelId) {
    throw new Error("Google Gemini: model resolved to empty");
  }
  return modelId;
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error("Google Gemini rate limit exceeded — the service is receiving too many requests.");
  }
  if (status === 403) {
    return new Error("Google Gemini: API key lacks permission or quota is exhausted.");
  }
  return new Error(`Google Gemini API error (${status}): ${bodyStr}`);
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
  return sdkHttpRequest(opts);
}

function ensureOk(res: SdkHttpResponse): void {
  if (res.status < 200 || res.status >= 300) {
    throw classifyError(res.status, res.body);
  }
}

function simplifyGenerateContent(body: unknown): Record<string, unknown> {
  const b = body as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const parts = b.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  return {
    candidates: b.candidates ?? [],
    text,
  };
}

function extractTextFromContent(body: unknown): string {
  const b = body as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const parts = b.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

function getBinaryFromItem(item: INodeExecutionData, fieldName: string): IBinaryData {
  const bin = item.binary?.[fieldName];
  if (!bin) {
    throw new Error(`Google Gemini: binary property "${fieldName}" not found on item`);
  }
  return bin;
}

function buildGenerateContentBody(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
): Record<string, unknown> {
  const prompt = resolveString(ctx, ctx.getParam("prompt"), item.json);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
    { role: "user", parts: [{ text: prompt }] },
  ];

  const generationConfig: Record<string, unknown> = {};
  if (options.temperature != null) generationConfig.temperature = options.temperature;
  if (options.topK != null) generationConfig.topK = options.topK;
  if (options.topP != null) generationConfig.topP = options.topP;
  if (options.maxOutputTokens != null) generationConfig.maxOutputTokens = options.maxOutputTokens;

  const body: Record<string, unknown> = { contents };
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  return body;
}

function buildInlineDataBody(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  mimeType: string,
): Record<string, unknown> {
  const prompt = resolveString(ctx, ctx.getParam("prompt"), item.json);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const binaryData = ctx.getParam<{ property?: string }>("binaryData");

  const binaryProperty = binaryData?.property ?? "data";
  const bin = getBinaryFromItem(item, binaryProperty);

  const contents: Array<{
    role: string;
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }> = [
    {
      role: "user",
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: bin.mimeType || mimeType,
            data: bin.data,
          },
        },
      ],
    },
  ];

  const generationConfig: Record<string, unknown> = {};
  if (options.temperature != null) generationConfig.temperature = options.temperature;
  if (options.topK != null) generationConfig.topK = options.topK;
  if (options.topP != null) generationConfig.topP = options.topP;
  if (options.maxOutputTokens != null) generationConfig.maxOutputTokens = options.maxOutputTokens;

  const body: Record<string, unknown> = { contents };
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  return body;
}

async function handleText(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const model = resolveModel(ctx, item.json);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const simplifyOutput = ctx.getParam<boolean>("simplify", false);

  const body = buildGenerateContentBody(ctx, item, itemIndex);
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await callApi("POST", url, { "content-type": "application/json" }, body, timeoutMs);
  ensureOk(res);

  const json = simplifyOutput
    ? simplifyGenerateContent(res.body)
    : (res.body as Record<string, unknown>);
  return { json, pairedItem: { item: itemIndex, input: 0 } };
}

async function handleImage(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "analyze");
  const model = resolveModel(ctx, item.json);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const simplifyOutput = ctx.getParam<boolean>("simplify", false);

  if (operation === "analyze") {
    const body = buildInlineDataBody(ctx, item, itemIndex, "image/png");
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await callApi("POST", url, { "content-type": "application/json" }, body, timeoutMs);
    ensureOk(res);
    const json = simplifyOutput
      ? simplifyGenerateContent(res.body)
      : (res.body as Record<string, unknown>);
    return { json, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "generate") {
    const prompt = resolveString(ctx, ctx.getParam("prompt"), item.json);
    const aspectRatio = options.aspectRatio ?? "1:1";
    const numberOfSamples = (options.numberOfSamples as number) ?? 1;

    const imagenBody: Record<string, unknown> = {
      instances: [{ prompt }],
      parameters: { sampleCount: numberOfSamples, aspectRatio },
    };

    const url = `${baseUrl}/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(apiKey)}`;
    const res = await callApi("POST", url, { "content-type": "application/json" }, imagenBody, timeoutMs);
    ensureOk(res);

    const b = res.body as {
      predictions?: Array<{
        mimeType?: string;
        bytesBase64Encoded?: string;
      }>;
    };
    const predictions = b.predictions ?? [];
    if (predictions.length === 0) {
      return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
    }

    const output: INodeExecutionData = {
      json: { predictions },
      pairedItem: { item: itemIndex, input: 0 },
    };

    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      if (pred.bytesBase64Encoded) {
        const fieldName = `image_${itemIndex}_${i}`;
        if (!output.binary) output.binary = {};
        output.binary[fieldName] = {
          data: pred.bytesBase64Encoded,
          mimeType: pred.mimeType ?? "image/png",
          fileName: `generated_${itemIndex}_${i}.png`,
        };
      }
    }

    return output;
  }

  if (operation === "edit") {
    throw new Error("Google Gemini: image operation edit is not yet implemented");
  }

  throw new Error(`Google Gemini: unknown image operation "${operation}"`);
}

async function handleAudio(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "analyze");
  const model = resolveModel(ctx, item.json);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const simplifyOutput = ctx.getParam<boolean>("simplify", false);

  if (operation === "analyze" || operation === "transcribe") {
    const body = buildInlineDataBody(ctx, item, itemIndex, "audio/mpeg");
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await callApi("POST", url, { "content-type": "application/json" }, body, timeoutMs);
    ensureOk(res);
    const json = simplifyOutput
      ? simplifyGenerateContent(res.body)
      : (res.body as Record<string, unknown>);
    return { json, pairedItem: { item: itemIndex, input: 0 } };
  }

  throw new Error(`Google Gemini: unknown audio operation "${operation}"`);
}

async function handleDocument(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const model = resolveModel(ctx, item.json);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const simplifyOutput = ctx.getParam<boolean>("simplify", false);

  const body = buildInlineDataBody(ctx, item, itemIndex, "application/pdf");
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await callApi("POST", url, { "content-type": "application/json" }, body, timeoutMs);
  ensureOk(res);
  const json = simplifyOutput
    ? simplifyGenerateContent(res.body)
    : (res.body as Record<string, unknown>);
  return { json, pairedItem: { item: itemIndex, input: 0 } };
}

async function handleVideo(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "analyze");
  const model = resolveModel(ctx, item.json);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const simplifyOutput = ctx.getParam<boolean>("simplify", false);

  if (operation === "analyze") {
    const body = buildInlineDataBody(ctx, item, itemIndex, "video/mp4");
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await callApi("POST", url, { "content-type": "application/json" }, body, timeoutMs);
    ensureOk(res);
    const json = simplifyOutput
      ? simplifyGenerateContent(res.body)
      : (res.body as Record<string, unknown>);
    return { json, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "generate") {
    throw new Error("Google Gemini: video operation generate is not yet implemented");
  }

  if (operation === "download") {
    throw new Error("Google Gemini: video operation download is not yet implemented");
  }

  throw new Error(`Google Gemini: unknown video operation "${operation}"`);
}

async function handleFile(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const binaryData = ctx.getParam<{ property?: string }>("binaryData");
  const binaryProperty = binaryData?.property ?? "data";
  const bin = getBinaryFromItem(item, binaryProperty);

  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`;
  const blob = new Blob([Buffer.from(bin.data, "base64")], { type: bin.mimeType });
  const formData = new FormData();
  formData.append("file", blob, bin.fileName ?? "file");

  const headers: Record<string, string> = {};
  const res = await callApi("POST", uploadUrl, headers, formData, DEFAULT_TIMEOUT);
  ensureOk(res);

  return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
}

async function handleFileSearch(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "listStores");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const storesBase = `${baseUrl}/fileSearchStores`;

  if (operation === "createStore") {
    const storeName = resolveString(ctx, ctx.getParam("storeName"), item.json);
    const body: Record<string, unknown> = { displayName: storeName };
    const res = await callApi("POST", `${storesBase}?key=${encodeURIComponent(apiKey)}`, { "content-type": "application/json" }, body, timeoutMs);
    ensureOk(res);
    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "deleteStore") {
    const storeId = resolveString(ctx, ctx.getParam("storeId"), item.json);
    const res = await callApi("DELETE", `${storesBase}/${encodeURIComponent(storeId)}?key=${encodeURIComponent(apiKey)}`, {}, undefined, timeoutMs);
    ensureOk(res);
    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "listStores") {
    const res = await callApi("GET", `${storesBase}?key=${encodeURIComponent(apiKey)}`, {}, undefined, timeoutMs);
    ensureOk(res);
    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "uploadToStore") {
    throw new Error("Google Gemini: fileSearch operation uploadToStore is not yet implemented");
  }

  throw new Error(`Google Gemini: unknown fileSearch operation "${operation}"`);
}

export const googleGeminiExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "googlePalmApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Google Gemini: credential "googlePalmApi" is missing apiKey');
  }
  const baseUrl = String(credentials.baseUrl ?? DEFAULT_BASE_URL);

  const resource = ctx.getParam<string>("resource", "text");
  const items = ctx.getInputItems(0);
  const output: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: INodeExecutionData;
      switch (resource) {
        case "text":
          result = await handleText(ctx, item, i, apiKey, baseUrl);
          break;
        case "image":
          result = await handleImage(ctx, item, i, apiKey, baseUrl);
          break;
        case "audio":
          result = await handleAudio(ctx, item, i, apiKey, baseUrl);
          break;
        case "document":
          result = await handleDocument(ctx, item, i, apiKey, baseUrl);
          break;
        case "video":
          result = await handleVideo(ctx, item, i, apiKey, baseUrl);
          break;
        case "file":
          result = await handleFile(ctx, item, i, apiKey, baseUrl);
          break;
        case "fileSearch":
          result = await handleFileSearch(ctx, item, i, apiKey, baseUrl);
          break;
        default:
          throw new Error(`Google Gemini: unknown resource "${resource}"`);
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
