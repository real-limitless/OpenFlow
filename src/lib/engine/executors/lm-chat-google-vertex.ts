import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";

const DEFAULT_REGION = "us-central1";
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export interface VertexChatMessage {
  role: "user" | "model" | "function";
  parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }>;
}

export interface VertexCompletionResult {
  text: string;
  model: string;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface VertexModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatGoogleVertex";
  projectId: string;
  model: string;
  region: string;
  options: Record<string, unknown>;
  invoke(messages: VertexChatMessage[], systemInstruction?: string): Promise<VertexCompletionResult>;
}

export type VertexHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: VertexHttpClient | null = null;

export function setVertexHttpClient(factory: VertexHttpClient | null): void {
  httpOverride = factory;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
  cachedResultName?: string;
}

function resolveResourceLocatorParam(ctx: ExecutionContext, name: string): string {
  const raw = ctx.getParam<unknown>(name);
  let value: unknown;
  if (raw && typeof raw === "object" && "__rl" in (raw as Record<string, unknown>)) {
    value = (raw as ResourceLocator).value;
  } else {
    value = raw;
  }
  if (value == null || value === "") {
    throw new Error(`Google Vertex Chat Model: ${name} is required`);
  }
  const str = String(value);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const result = String(resolved ?? "").trim();
  if (!result) {
    throw new Error(`Google Vertex Chat Model: ${name} resolved to empty`);
  }
  return result;
}

function buildGenerateContentUrl(projectId: string, model: string, region: string): string {
  return `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent`;
}

async function getAccessToken(credentials: Record<string, unknown>): Promise<string> {
  const creds = credentials as {
    email?: string;
    serviceAccountEmail?: string;
    privateKey?: string;
    accessToken?: string;
  };

  const token = creds.accessToken;
  if (token) {
    return token;
  }

  const email = creds.email ?? creds.serviceAccountEmail;
  const privateKey = creds.privateKey;
  if (!email || !privateKey) {
    throw new Error(
      'Google Vertex Chat Model: googleApi credential must include email (or serviceAccountEmail) and privateKey',
    );
  }

  return jwtAssertion(email, privateKey);
}

async function jwtAssertion(clientEmail: string, privateKey: string): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: CLOUD_PLATFORM_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const signatureInput = `${b64(header)}.${b64(claim)}`;

  const { createPrivateKey, sign } = await import("node:crypto");
  const key = createPrivateKey(privateKey);
  const signature = sign(null, Buffer.from(signatureInput, "utf-8"), key);
  const jwt = `${signatureInput}.${signature.toString("base64url")}`;

  const http = httpOverride ?? sdkHttpRequest;
  const res = await http({
    method: "POST",
    url: TOKEN_URL,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Google Vertex AI: OAuth2 token exchange failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const data = res.body as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google Vertex AI: OAuth2 token response missing access_token");
  }
  return data.access_token;
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

function mapMessages(messages: VertexChatMessage[], systemInstruction?: string): {
  contents: VertexChatMessage[];
  systemInstruction?: { parts: Array<{ text: string }> };
} {
  const systemInstructionObj = systemInstruction
    ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
    : undefined;
  return { contents: messages, ...systemInstructionObj };
}

function buildGenerateContentBody(
  messages: VertexChatMessage[],
  options: Record<string, unknown>,
  systemInstruction?: string,
): Record<string, unknown> {
  const { contents, systemInstruction: si } = mapMessages(messages, systemInstruction);

  const body: Record<string, unknown> = { contents };
  if (si) {
    body.systemInstruction = si;
  }

  const generationConfig: Record<string, unknown> = {};
  if (options.maxTokens != null) generationConfig.maxOutputTokens = options.maxTokens;
  if (options.temperature != null) generationConfig.temperature = options.temperature;
  if (options.topP != null) generationConfig.topP = options.topP;
  if (options.topK != null) generationConfig.topK = options.topK;
  if (options.thinkingBudget != null) {
    generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget };
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  if (options.safetySettings != null) {
    const ss = options.safetySettings as { values?: Array<Record<string, unknown>> };
    if (ss.values && Array.isArray(ss.values) && ss.values.length > 0) {
      body.safetySettings = ss.values.map((entry) => ({
        category: mapCategory(entry.category as string),
        threshold: mapThreshold(entry.threshold as string),
      }));
    }
  }

  return body;
}

function mapCategory(category: string): string {
  const map: Record<string, string> = {
    harassment: "HARM_CATEGORY_HARASSMENT",
    hateSpeech: "HARM_CATEGORY_HATE_SPEECH",
    sexuallyExplicit: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    dangerousContent: "HARM_CATEGORY_DANGEROUS_CONTENT",
  };
  return map[category] ?? category;
}

function mapThreshold(threshold: string): string {
  const map: Record<string, string> = {
    blockNone: "BLOCK_NONE",
    blockLowAndAbove: "BLOCK_LOW_AND_ABOVE",
    blockMediumAndAbove: "BLOCK_MEDIUM_AND_ABOVE",
    blockOnlyHigh: "BLOCK_ONLY_HIGH",
  };
  return map[threshold] ?? threshold;
}

function parseGenerateContentResponse(body: unknown, model: string): VertexCompletionResult {
  const b = body as {
    candidates?: Array<{
      index?: number;
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const candidate = b.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  return {
    text,
    model,
    finishReason: candidate?.finishReason ?? "UNKNOWN",
    usage: {
      promptTokens: b.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: b.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: b.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 404) {
    return new Error(`Google Vertex AI model not found (404): ${bodyStr}`);
  }
  if (status === 401 || status === 403) {
    return new Error(`Google Vertex AI authentication error (${status}) — check your service account or token. ${bodyStr}`);
  }
  if (status === 429) {
    return new Error("Google Vertex AI rate limit exceeded — reduce request rate or retry with backoff.");
  }
  return new Error(`Google Vertex AI API error (${status}): ${bodyStr}`);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function invokeModel(
  handle: {
    projectId: string;
    model: string;
    region: string;
    options: Record<string, unknown>;
    accessToken: string;
  },
  messages: VertexChatMessage[],
  systemInstruction?: string,
): Promise<VertexCompletionResult> {
  const http = httpOverride ?? sdkHttpRequest;
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const headers = buildHeaders(handle.accessToken);

  const url = buildGenerateContentUrl(handle.projectId, handle.model, handle.region);
  const body = buildGenerateContentBody(messages, handle.options, systemInstruction);

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
      throw new Error(`Google Vertex AI request failed: ${lastError.message}`);
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

  throw lastError ?? new Error("Google Vertex AI request failed after retries");
}

export const lmChatGoogleVertexExecutor: NodeExecutor = async (ctx) => {
  const credentials = await requireCredential(ctx, "googleApi");
  const accessToken = await getAccessToken(credentials);

  const projectId = resolveResourceLocatorParam(ctx, "projectId");
  const modelName = resolveResourceLocatorParam(ctx, "modelName");

  const locationParam = ctx.getParam<string>("location", "");
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolvedLocation = locationParam ? String(ctx.evaluate(locationParam, firstJson) ?? "").trim() : "";
  const region = resolvedLocation || String(credentials.region ?? "") || DEFAULT_REGION;

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const handle: VertexModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatGoogleVertex",
    projectId,
    model: modelName,
    region,
    options,
    invoke(
      messages: VertexChatMessage[],
      systemInstruction?: string,
    ): Promise<VertexCompletionResult> {
      return invokeModel({ projectId, model: modelName, region, options, accessToken }, messages, systemInstruction);
    },
  };
  const pairedItem =
    items.length > 0 ? (items[0].pairedItem ?? { item: 0, input: 0 }) : { item: 0, input: 0 };

  const output: INodeExecutionData = {
    json: handle as unknown as Record<string, unknown>,
    pairedItem,
  };

  return [[output]];
};
