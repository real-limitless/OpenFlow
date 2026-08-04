import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT = 120000;

type ToolHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: ToolHttpClient | null = null;

export function setGoogleGeminiToolHttpClient(factory: ToolHttpClient | null): void {
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

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error("Google Gemini Tool rate limit exceeded");
  }
  if (status === 403) {
    return new Error("Google Gemini Tool: API key lacks permission or quota is exhausted");
  }
  return new Error(`Google Gemini Tool API error (${status}): ${bodyStr}`);
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
  return { candidates: b.candidates ?? [], text };
}

function readToolParam(
  itemJson: Record<string, unknown>,
  name: string,
  defaultValue?: unknown,
): unknown {
  const val = itemJson[name];
  return val !== undefined ? val : defaultValue;
}

function buildGenerateContentBodyFromItem(
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const prompt = String(readToolParam(itemJson, "prompt", "") ?? "");
  const messages = readToolParam(itemJson, "messages");

  let contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  if (Array.isArray(messages)) {
    contents = (messages as Array<{ role: string; content: string }>).map((m) => ({
      role: m.role ?? "user",
      parts: [{ text: m.content }],
    }));
  } else if (messages && typeof messages === "object" && "values" in (messages as object)) {
    const values = (messages as { values: Array<{ role: string; content: string }> }).values;
    if (Array.isArray(values)) {
      contents = values.map((m) => ({
        role: m.role ?? "user",
        parts: [{ text: m.content }],
      }));
    } else {
      contents = [{ role: "user", parts: [{ text: prompt }] }];
    }
  } else {
    contents = [{ role: "user", parts: [{ text: prompt }] }];
  }

  const body: Record<string, unknown> = { contents };
  return body;
}

async function fetchUrlAsBase64(url: string): Promise<string> {
  const res = await callApi("GET", url, {}, undefined, 30000);
  ensureOk(res);
  const raw = res.body;
  if (typeof raw === "string") return Buffer.from(raw).toString("base64");
  return Buffer.from(JSON.stringify(raw)).toString("base64");
}

async function buildInlineDataBodyFromItem(
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  mimeType: string,
): Promise<Record<string, unknown>> {
  const prompt = String(readToolParam(itemJson, "text", readToolParam(itemJson, "prompt", "") ?? ""));
  const binaryProperty = String(readToolParam(itemJson, "binaryPropertyName", "data") ?? "data");
  const imageUrls = readToolParam(itemJson, "imageUrls");

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  if (imageUrls && typeof imageUrls === "string") {
    const urls = imageUrls.split(",").map((u) => u.trim()).filter(Boolean);
    for (const url of urls) {
      const b64 = await fetchUrlAsBase64(url);
      parts.push({ inlineData: { mimeType, data: b64 } });
    }
  }

  const bin = item?.binary?.[binaryProperty];
  if (bin) {
    parts.push({
      inlineData: {
        mimeType: bin.mimeType || mimeType,
        data: bin.data,
      },
    });
  }

  return { contents: [{ role: "user", parts }] };
}

async function handleText(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const modelParam = readToolParam(itemJson, "modelId", undefined);
  const model =
    modelParam && typeof modelParam === "object" && "value" in (modelParam as object)
      ? String((modelParam as { value: string }).value)
      : String(ctx.getParam("model", "gemini-2.0-flash"));
  const simplifyOutput = Boolean(readToolParam(itemJson, "simplify", ctx.getParam("simplify", false)));
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;

  const body = buildGenerateContentBodyFromItem(itemJson);
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
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const operation = String(readToolParam(itemJson, "operation", "analyze") ?? "analyze");
  const modelParam = readToolParam(itemJson, "modelId", undefined);
  const model =
    modelParam && typeof modelParam === "object" && "value" in (modelParam as object)
      ? String((modelParam as { value: string }).value)
      : String(ctx.getParam("model", "gemini-2.0-flash"));
  const simplifyOutput = Boolean(readToolParam(itemJson, "simplify", ctx.getParam("simplify", false)));
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;

  if (operation === "analyze") {
    const body = await buildInlineDataBodyFromItem(itemJson, item, "image/png");
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await callApi("POST", url, { "content-type": "application/json" }, body, timeoutMs);
    ensureOk(res);
    const json = simplifyOutput
      ? simplifyGenerateContent(res.body)
      : (res.body as Record<string, unknown>);
    return { json, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "generate") {
    const prompt = String(readToolParam(itemJson, "prompt", "") ?? "");
    const aspectRatio = String((options.aspectRatio as string) ?? "1:1");
    const numberOfSamples = (options.numberOfSamples as number) ?? 1;

    const imagenBody: Record<string, unknown> = {
      instances: [{ prompt }],
      parameters: { sampleCount: numberOfSamples, aspectRatio },
    };

    const url = `${baseUrl}/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(apiKey)}`;
    const res = await callApi("POST", url, { "content-type": "application/json" }, imagenBody, timeoutMs);
    ensureOk(res);

    const b = res.body as {
      predictions?: Array<{ mimeType?: string; bytesBase64Encoded?: string }>;
    };
    const predictions = b.predictions ?? [];
    const outputJson: Record<string, unknown> = { predictions };
    const output: INodeExecutionData = {
      json: outputJson,
      pairedItem: { item: itemIndex, input: 0 },
    };

    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      if (pred.bytesBase64Encoded) {
        const mimeType = pred.mimeType ?? "image/png";
        if (!output.binary) output.binary = {};
        output.binary[`image_${itemIndex}_${i}`] = {
          data: pred.bytesBase64Encoded,
          mimeType,
          fileName: `generated_${itemIndex}_${i}.png`,
        };
        outputJson[`image_${itemIndex}_${i}`] = {
          uri: `data:${mimeType};base64,${pred.bytesBase64Encoded.slice(0, 40)}...`,
          mimeType,
        };
      }
    }

    return output;
  }

  if (operation === "edit") {
    throw new Error("Google Gemini Tool: image operation edit is not yet implemented");
  }

  throw new Error(`Google Gemini Tool: unknown image operation "${operation}"`);
}

async function handleAudio(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const modelParam = readToolParam(itemJson, "modelId", undefined);
  const model =
    modelParam && typeof modelParam === "object" && "value" in (modelParam as object)
      ? String((modelParam as { value: string }).value)
      : String(ctx.getParam("model", "gemini-2.0-flash"));
  const simplifyOutput = Boolean(readToolParam(itemJson, "simplify", ctx.getParam("simplify", false)));
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;

  const body = await buildInlineDataBodyFromItem(itemJson, item, "audio/mpeg");
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await callApi("POST", url, { "content-type": "application/json" }, body, timeoutMs);
  ensureOk(res);
  const json = simplifyOutput
    ? simplifyGenerateContent(res.body)
    : (res.body as Record<string, unknown>);
  return { json, pairedItem: { item: itemIndex, input: 0 } };
}

async function handleDocument(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const modelParam = readToolParam(itemJson, "modelId", undefined);
  const model =
    modelParam && typeof modelParam === "object" && "value" in (modelParam as object)
      ? String((modelParam as { value: string }).value)
      : String(ctx.getParam("model", "gemini-2.0-flash"));
  const simplifyOutput = Boolean(readToolParam(itemJson, "simplify", ctx.getParam("simplify", false)));
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;

  const body = await buildInlineDataBodyFromItem(itemJson, item, "application/pdf");
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
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const operation = String(readToolParam(itemJson, "operation", "analyze") ?? "analyze");
  const modelParam = readToolParam(itemJson, "modelId", undefined);
  const model =
    modelParam && typeof modelParam === "object" && "value" in (modelParam as object)
      ? String((modelParam as { value: string }).value)
      : String(ctx.getParam("model", "gemini-2.0-flash"));
  const simplifyOutput = Boolean(readToolParam(itemJson, "simplify", ctx.getParam("simplify", false)));
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;

  if (operation === "analyze") {
    const body = await buildInlineDataBodyFromItem(itemJson, item, "video/mp4");
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await callApi("POST", url, { "content-type": "application/json" }, body, timeoutMs);
    ensureOk(res);
    const json = simplifyOutput
      ? simplifyGenerateContent(res.body)
      : (res.body as Record<string, unknown>);
    return { json, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "generate") {
    throw new Error("Google Gemini Tool: video operation generate is not yet implemented");
  }

  if (operation === "download") {
    throw new Error("Google Gemini Tool: video operation download is not yet implemented");
  }

  throw new Error(`Google Gemini Tool: unknown video operation "${operation}"`);
}

async function handleFile(
  itemIndex: number,
  apiKey: string,
): Promise<INodeExecutionData> {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`;
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(0)], { type: "application/octet-stream" });
  formData.append("file", blob, "file");

  const headers: Record<string, string> = {};
  const res = await callApi("POST", uploadUrl, headers, formData, DEFAULT_TIMEOUT);
  ensureOk(res);

  return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
}

async function handleFileSearch(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
  itemIndex: number,
  apiKey: string,
  baseUrl: string,
): Promise<INodeExecutionData> {
  const operation = String(readToolParam(itemJson, "operation", "listStores") ?? "listStores");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? DEFAULT_TIMEOUT;
  const storesBase = `${baseUrl}/fileSearchStores`;

  if (operation === "createStore") {
    const storeDisplayName = String(readToolParam(itemJson, "storeDisplayName", readToolParam(itemJson, "storeName", "") ?? ""));
    const body: Record<string, unknown> = { displayName: storeDisplayName };
    const res = await callApi("POST", `${storesBase}?key=${encodeURIComponent(apiKey)}`, { "content-type": "application/json" }, body, timeoutMs);
    ensureOk(res);
    return { json: res.body as Record<string, unknown>, pairedItem: { item: itemIndex, input: 0 } };
  }

  if (operation === "deleteStore") {
    const storeId = String(readToolParam(itemJson, "storeId", "") ?? "");
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
    throw new Error("Google Gemini Tool: fileSearch operation uploadToStore is not yet implemented");
  }

  throw new Error(`Google Gemini Tool: unknown fileSearch operation "${operation}"`);
}

export const googleGeminiToolExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "googlePalmApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Google Gemini Tool: credential "googlePalmApi" is missing apiKey');
  }
  const baseUrl = String(credentials.baseUrl ?? DEFAULT_BASE_URL);

  const resource = readToolParam({}, "resource", ctx.getParam("resource", "text")) as string;
  const items = ctx.getInputItems(0);
  const output: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemJson = item.json ?? {};
    const actualResource = String(readToolParam(itemJson, "resource", resource));
    try {
      let result: INodeExecutionData;
      switch (actualResource) {
        case "text":
          result = await handleText(ctx, itemJson, i, apiKey, baseUrl);
          break;
        case "image":
          result = await handleImage(ctx, itemJson, item, i, apiKey, baseUrl);
          break;
        case "audio":
          result = await handleAudio(ctx, itemJson, item, i, apiKey, baseUrl);
          break;
        case "document":
          result = await handleDocument(ctx, itemJson, item, i, apiKey, baseUrl);
          break;
        case "video":
          result = await handleVideo(ctx, itemJson, item, i, apiKey, baseUrl);
          break;
        case "file":
          result = await handleFile(i, apiKey);
          break;
        case "fileSearch":
          result = await handleFileSearch(ctx, itemJson, i, apiKey, baseUrl);
          break;
        default:
          throw new Error(`Google Gemini Tool: unknown resource "${actualResource}"`);
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
