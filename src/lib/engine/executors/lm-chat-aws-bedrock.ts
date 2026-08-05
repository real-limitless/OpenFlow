import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest, type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";
import { createHash, createHmac } from "crypto";

export interface BedrockChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface BedrockCompletionResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export interface BedrockModelHandle {
  type: "@n8n/n8n-nodes-langchain.lmChatAwsBedrock";
  model: string;
  authentication: string;
  options: Record<string, unknown>;
  region: string;
  customEndpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  invoke(messages: BedrockChatMessage[]): Promise<BedrockCompletionResult>;
}

export type BedrockHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;

let httpOverride: BedrockHttpClient | null = null;

export function setBedrockHttpClient(factory: BedrockHttpClient | null): void {
  httpOverride = factory;
}

interface ResourceLocator {
  __rl?: boolean;
  mode?: string;
  value?: unknown;
  cachedResultName?: string;
}

const DEFAULT_TIMEOUT = 120000;
const DEFAULT_MAX_RETRIES = 2;

function resolveModelId(ctx: ExecutionContext): string {
  const modelParam = ctx.getParam<unknown>("model");
  let raw: unknown = modelParam;

  if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) {
    raw = (modelParam as ResourceLocator).value;
  }

  if (raw == null || raw === "") {
    throw new Error("AWS Bedrock Chat Model: model id is required");
  }

  const str = String(raw);
  const items = ctx.getInputItems(0);
  const firstJson = items[0]?.json ?? {};
  const resolved = ctx.evaluate(str, firstJson);
  const modelId = String(resolved ?? "").trim();

  if (!modelId) {
    throw new Error("AWS Bedrock Chat Model: model id resolved to empty");
  }
  return modelId;
}

function getOptions(ctx: ExecutionContext): Record<string, unknown> {
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  return options ?? {};
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hashHex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function buildConverseUrl(region: string, modelId: string, customEndpoint?: string): string {
  if (customEndpoint) {
    return `${customEndpoint.replace(/\/$/, "")}/model/${encodeURIComponent(modelId)}/converse`;
  }
  return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
}

async function signAndFetch(
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken: string | undefined,
  method: string,
  url: string,
  bodyStr: string,
  timeoutMs: number,
  service: string = "bedrock",
): Promise<SdkHttpResponse> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname;
  const queryString = parsedUrl.searchParams.toString();
  const sortedQuery = queryString
    ? queryString.split("&").sort().join("&")
    : "";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hashHex(bodyStr);

  const headers: Record<string, string> = {
    host,
    "content-type": "application/json",
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (sessionToken) {
    headers["x-amz-security-token"] = sessionToken;
  }

  const signedHeaderKeys = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${String(headers[k] ?? "").trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderKeys.join(";");

  const canonicalRequest = [
    method,
    path
      .split("/")
      .map((p) => encodeURIComponent(decodeURIComponent(p)))
      .join("/")
      .replace(/\/+/g, "/"),
    sortedQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const http = httpOverride ?? sdkHttpRequest;
  return http({ method, url, headers, body: bodyStr, timeoutMs });
}

function mapMessagesToConverse(messages: BedrockChatMessage[]): {
  system?: Array<{ text: string }>;
  messages: Array<{
    role: string;
    content: Array<{ text: string }>;
  }>;
} {
  const systemParts: string[] = [];
  const converseMessages: Array<{
    role: string;
    content: Array<{ text: string }>;
  }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
      continue;
    }
    let role = msg.role;
    if (role === "tool") role = "user";
    converseMessages.push({
      role,
      content: [{ text: msg.content }],
    });
  }

  return {
    system: systemParts.length > 0 ? systemParts.map((t) => ({ text: t })) : undefined,
    messages: converseMessages,
  };
}

function buildConverseBody(
  messages: BedrockChatMessage[],
  options: Record<string, unknown>,
): Record<string, unknown> {
  const { system, messages: mapped } = mapMessagesToConverse(messages);

  const body: Record<string, unknown> = {
    messages: mapped,
  };

  if (system != null) body.system = system;

  const inferenceConfig: Record<string, unknown> = {};
  const maxTokens = options.maxTokens ?? options.maxTokensToSample;
  if (maxTokens != null) inferenceConfig.maxTokens = maxTokens;
  if (options.temperature != null) inferenceConfig.temperature = options.temperature;
  if (options.topP != null) inferenceConfig.topP = options.topP;
  if (Object.keys(inferenceConfig).length > 0) body.inferenceConfig = inferenceConfig;

  if (options.additionalModelRequestFields) {
    let extra: Record<string, unknown>;
    if (typeof options.additionalModelRequestFields === "string") {
      try {
        extra = JSON.parse(options.additionalModelRequestFields as string);
      } catch {
        extra = {};
      }
    } else {
      extra = options.additionalModelRequestFields as Record<string, unknown>;
    }
    Object.assign(body, extra);
  }

  const latency = options.latencyOptimization === "Optimized" ? "optimized" : options.latency;
  if (latency === "optimized" || latency === "standard") {
    body.performanceConfig = { latency };
  }

  const guardrailRaw = options.guardrail as
    | { guardrailIdentifier?: string; guardrailVersion?: string; trace?: string; values?: Record<string, unknown> }
    | undefined;
  const guardrail = guardrailRaw?.values ?? guardrailRaw;
  if (guardrail?.guardrailIdentifier) {
    const guardrailConfig: Record<string, unknown> = {
      guardrailIdentifier: guardrail.guardrailIdentifier,
      guardrailVersion: guardrail.guardrailVersion ?? "DRAFT",
    };
    if (guardrail.trace && guardrail.trace !== "Disabled") {
      guardrailConfig.trace = guardrail.trace;
    }
    body.guardrailConfig = guardrailConfig;
  }

  return body;
}

function parseConverseResponse(body: unknown, modelId: string): BedrockCompletionResult {
  const b = body as {
    output?: {
      message?: {
        content?: Array<{ text?: string }>;
      };
    };
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  };

  const text =
    b.output?.message?.content
      ?.filter((c) => c.text != null)
      .map((c) => c.text ?? "")
      .join("") ?? "";

  return {
    text,
    model: modelId,
    usage: {
      inputTokens: b.usage?.inputTokens ?? 0,
      outputTokens: b.usage?.outputTokens ?? 0,
      totalTokens: b.usage?.totalTokens ?? 0,
    },
  };
}

function checkGuardrailBlocked(body: unknown): string | null {
  const record = body as Record<string, unknown>;
  if (record.guardrailAction === "INTERVENED") {
    const issueMsg =
      (record as { guardrailMessage?: string }).guardrailMessage ??
      "The request was blocked by the AWS Bedrock guardrail.";
    return issueMsg;
  }
  return null;
}

function classifyError(status: number, body: unknown): Error {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  if (status === 429) {
    return new Error(
      "AWS Bedrock rate limit exceeded — the service is receiving too many requests.",
    );
  }
  if (status === 403) {
    return new Error(`AWS Bedrock access denied (403) — check IAM permissions. ${bodyStr}`);
  }
  if (status === 400) {
    return new Error(`AWS Bedrock validation error (400): ${bodyStr}`);
  }
  return new Error(`AWS Bedrock API error (${status}): ${bodyStr}`);
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

async function invokeBedrock(
  handle: {
    model: string;
    region: string;
    options: Record<string, unknown>;
    customEndpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  },
  messages: BedrockChatMessage[],
): Promise<BedrockCompletionResult> {
  const timeout = (handle.options.timeout as number) ?? DEFAULT_TIMEOUT;
  const maxRetries = (handle.options.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const url = buildConverseUrl(handle.region, handle.model, handle.customEndpoint);
  const body = buildConverseBody(messages, handle.options);
  const bodyStr = JSON.stringify(body);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: SdkHttpResponse;
    try {
      res = await signAndFetch(
        handle.region,
        handle.accessKeyId,
        handle.secretAccessKey,
        handle.sessionToken,
        "POST",
        url,
        bodyStr,
        timeout,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`AWS Bedrock request failed: ${lastError.message}`);
    }

    const blocked = checkGuardrailBlocked(res.body);
    if (blocked != null) {
      return {
        text: blocked,
        model: handle.model,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    if (res.status >= 200 && res.status < 300) {
      return parseConverseResponse(res.body, handle.model);
    }

    lastError = classifyError(res.status, res.body);

    if (isRetryable(res.status) && attempt < maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("AWS Bedrock request failed after retries");
}

async function stsAssumeRole(
  cred: Record<string, unknown>,
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }> {
  const roleArn = String(cred.roleArn ?? "");
  if (!roleArn) {
    throw new Error('AWS Bedrock Chat Model: credential "awsAssumeRole" is missing roleArn');
  }
  const externalId = String(cred.externalId ?? "");
  if (!externalId) {
    throw new Error('AWS Bedrock Chat Model: credential "awsAssumeRole" is missing externalId');
  }
  const roleSessionName = String(cred.roleSessionName ?? "n8n-session");
  const stsRegion = String(cred.region ?? "us-east-1");

  let stsKey = "";
  let stsSecret = "";
  let stsToken: string | undefined;

  if (cred.useSystemCredentials) {
    stsKey = process.env.AWS_ACCESS_KEY_ID ?? "";
    stsSecret = process.env.AWS_SECRET_ACCESS_KEY ?? "";
    stsToken = process.env.AWS_SESSION_TOKEN;
  } else {
    stsKey = String(cred.stsAccessKeyId ?? "");
    stsSecret = String(cred.stsSecretAccessKey ?? "");
    stsToken = cred.stsSessionToken ? String(cred.stsSessionToken) : undefined;
  }

  if (!stsKey || !stsSecret) {
    throw new Error(
      'AWS Bedrock Chat Model: credential "awsAssumeRole" requires STS credentials (stsAccessKeyId/stsSecretAccessKey or system credentials)',
    );
  }

  const params = {
    Action: "AssumeRole",
    Version: "2011-06-15",
    RoleArn: roleArn,
    RoleSessionName: roleSessionName,
    ExternalId: externalId,
    DurationSeconds: 900,
  };
  const queryStr = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `https://sts.${stsRegion}.amazonaws.com/?${queryStr}`;

  const res = await signAndFetch(
    stsRegion,
    stsKey,
    stsSecret,
    stsToken,
    "GET",
    url,
    "",
    30000,
    "sts",
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `AWS STS AssumeRole failed (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }

  const bodyStr = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
  const akIdMatch = bodyStr.match(/<AccessKeyId>([^<]+)<\/AccessKeyId>/);
  const saKeyMatch = bodyStr.match(/<SecretAccessKey>([^<]+)<\/SecretAccessKey>/);
  const sTokMatch = bodyStr.match(/<SessionToken>([^<]+)<\/SessionToken>/);

  if (!akIdMatch || !saKeyMatch) {
    throw new Error(
      "AWS Bedrock Chat Model: failed to parse STS AssumeRole response",
    );
  }

  return {
    accessKeyId: akIdMatch[1],
    secretAccessKey: saKeyMatch[1],
    sessionToken: sTokMatch ? sTokMatch[1] : "",
  };
}

function normalizeAuth(auth: string): string {
  if (auth === "iam") return "aws";
  if (auth === "assumeRole") return "awsAssumeRole";
  return auth;
}

function getEndpointUrl(endpoints: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!endpoints) return undefined;
  const v = endpoints[key] ?? endpoints.bedrockRuntime ?? endpoints.bedrockRuntimeEndpoint;
  return v ? String(v) : undefined;
}

export const lmChatAwsBedrockExecutor: NodeExecutor = async (ctx) => {
  const rawAuth = ctx.getParam<string>("authentication", "aws");
  const authentication = normalizeAuth(rawAuth);

  let region = "";
  let customEndpoint: string | undefined;
  let accessKeyId = "";
  let secretAccessKey = "";
  let sessionToken: string | undefined;

  if (authentication === "aws") {
    const cred = await requireCredential(ctx, "aws");
    region = String(cred.region ?? "");
    if (!region) {
      throw new Error('AWS Bedrock Chat Model: credential "aws" is missing region');
    }
    accessKeyId = String(cred.accessKeyId ?? "");
    secretAccessKey = String(cred.secretAccessKey ?? "");
    sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
    customEndpoint = getEndpointUrl(cred.customEndpoints as Record<string, unknown> | undefined, "bedrockRuntime");
  } else if (authentication === "awsAssumeRole") {
    const cred = await requireCredential(ctx, "awsAssumeRole");
    region = String(cred.region ?? "");
    if (!region) {
      throw new Error('AWS Bedrock Chat Model: credential "awsAssumeRole" is missing region');
    }
    const stsResult = await stsAssumeRole(cred);
    accessKeyId = stsResult.accessKeyId;
    secretAccessKey = stsResult.secretAccessKey;
    sessionToken = stsResult.sessionToken;
    customEndpoint = getEndpointUrl(cred.customEndpoints as Record<string, unknown> | undefined, "bedrockRuntime");
  } else {
    throw new Error(`AWS Bedrock Chat Model: unknown authentication type "${authentication}"`);
  }

  const model = resolveModelId(ctx);
  const options = getOptions(ctx);

  const handle: BedrockModelHandle = {
    type: "@n8n/n8n-nodes-langchain.lmChatAwsBedrock",
    model,
    authentication,
    options,
    region,
    customEndpoint,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    invoke(messages: BedrockChatMessage[]): Promise<BedrockCompletionResult> {
      return invokeBedrock(
        { model, region, options, customEndpoint, accessKeyId, secretAccessKey, sessionToken },
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
