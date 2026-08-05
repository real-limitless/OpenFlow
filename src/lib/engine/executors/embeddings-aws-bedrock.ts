import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { requireCredential } from "@/sdk";
import crypto from "node:crypto";

const DEFAULT_MODEL = "amazon.titan-embed-text-v2:0";
const DEFAULT_REGION = "us-east-1";

export interface EmbeddingsAwsBedrockHandle {
  type: "@n8n/n8n-nodes-langchain.embeddingsAwsBedrock";
  model: string;
  region: string;
  customEndpoint: string | null;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export type EmbeddingsAwsBedrockHttpClient = (
  url: string,
  opts: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; body: unknown }>;

let httpOverride: EmbeddingsAwsBedrockHttpClient | null = null;

export function setEmbeddingsAwsBedrockHttpClient(
  factory: EmbeddingsAwsBedrockHttpClient | null,
): void {
  httpOverride = factory;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveModel(ctx: ExecutionContext): string {
  const raw = ctx.getParam<unknown>("model", DEFAULT_MODEL);
  if (raw == null || raw === "") {
    return DEFAULT_MODEL;
  }
  const str = String(raw);
  if (str.startsWith("=")) {
    const resolved = ctx.evaluate(str, firstItemJson(ctx));
    return String(resolved ?? "").trim() || DEFAULT_MODEL;
  }
  return str;
}

function resolveString(ctx: ExecutionContext, name: string, defaultValue: string): string {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return String(ctx.evaluate(raw, firstItemJson(ctx)) ?? defaultValue);
    }
    return raw;
  }
  if (raw == null) return defaultValue;
  return String(raw);
}

function hmacSha256(key: Buffer, message: string): Buffer {
  return crypto.createHmac("sha256", key).update(message, "utf8").digest();
}

function getSignatureKey(
  key: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(Buffer.from("AWS4" + key, "utf8"), dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

async function signV4(
  method: string,
  urlStr: string,
  headers: Record<string, string>,
  body: string,
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
  },
  service: string,
): Promise<Record<string, string>> {
  const url = new URL(urlStr);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const allHeaders: Record<string, string> = {
    ...headers,
    "x-amz-date": amzDate,
  };
  if (credentials.sessionToken) {
    allHeaders["x-amz-security-token"] = credentials.sessionToken;
  }

  const finalCanonicalHeaders =
    Object.entries(allHeaders)
      .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}\n`)
      .sort(([a], [b]) => a.localeCompare(b))
      .join("");

  const finalSignedHeaders = Object.keys(allHeaders)
    .map((k) => k.toLowerCase())
    .sort()
    .join(";");

  const payloadHash = sha256Hex(body);

  const canonicalRequest = [
    method,
    url.pathname,
    url.search,
    finalCanonicalHeaders,
    finalSignedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${credentials.region}/${service}/aws4_request`;

  const canonicalHash = sha256Hex(canonicalRequest);

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalHash,
  ].join("\n");

  const signingKey = getSignatureKey(
    credentials.secretAccessKey,
    dateStamp,
    credentials.region,
    service,
  );

  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${finalSignedHeaders}, Signature=${signature}`;

  return {
    ...allHeaders,
    authorization,
  };
}

async function callInvokeModel(
  client: EmbeddingsAwsBedrockHttpClient,
  modelId: string,
  body: unknown,
  baseUrl: string,
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
  },
): Promise<unknown> {
  const bodyStr = JSON.stringify(body);
  const url = `${baseUrl}/model/${modelId}/invoke`;
  const presignHeaders: Record<string, string> = {
    "content-type": "application/json",
    host: new URL(url).host,
  };
  const signed = await signV4("POST", url, presignHeaders, bodyStr, credentials, "bedrock");
  const res = await client(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...signed },
    body: bodyStr,
  });
  if (res.status >= 200 && res.status < 300) {
    return res.body;
  }
  throw new Error(`Bedrock API error (${res.status}): ${JSON.stringify(res.body)}`);
}

async function stsAssumeRole(
  client: EmbeddingsAwsBedrockHttpClient,
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
  },
  roleArn: string,
  externalId: string,
  roleSessionName: string,
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }> {
  const host = `sts.${credentials.region}.amazonaws.com`;
  const bodyStr = `Action=AssumeRole&RoleArn=${encodeURIComponent(roleArn)}&ExternalId=${encodeURIComponent(externalId)}&RoleSessionName=${encodeURIComponent(roleSessionName)}&Version=2011-06-15`;
  const url = `https://${host}/`;
  const presignHeaders: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    host,
  };
  const signed = await signV4(
    "POST",
    url,
    presignHeaders,
    bodyStr,
    credentials,
    "sts",
  );
  const res = await client(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...signed },
    body: bodyStr,
  });
  if (res.status >= 200 && res.status < 300) {
    const xml = String(res.body ?? "");
    const ak = extractXml(xml, "AccessKeyId");
    const sak = extractXml(xml, "SecretAccessKey");
    const st = extractXml(xml, "SessionToken");
    if (!ak || !sak || !st) {
      throw new Error("STS AssumeRole response missing credential fields");
    }
    return { accessKeyId: ak, secretAccessKey: sak, sessionToken: st };
  }
  throw new Error(`STS AssumeRole error (${res.status}): ${JSON.stringify(res.body)}`);
}

function extractXml(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>\\s*(.*?)\\s*</${tag}>`));
  return m ? m[1] : null;
}

function buildRequestBody(model: string, texts: string[]): { body: unknown; modelFamily: "titan" | "cohere" | "other" } {
  if (model.startsWith("cohere.")) {
    return {
      body: { texts, input_type: "search_document" },
      modelFamily: "cohere",
    };
  }
  if (model.startsWith("amazon.titan")) {
    return {
      body: { inputText: texts.join("\n") },
      modelFamily: "titan",
    };
  }
  return {
    body: { inputText: texts.join("\n") },
    modelFamily: "other",
  };
}

function parseResponseBody(model: string, body: unknown): number[] {
  const b = body as Record<string, unknown>;
  if (model.startsWith("cohere.")) {
    const embeddings = b.embeddings as number[][] | undefined;
    return embeddings?.[0] ?? [];
  }
  const embedding = b.embedding as number[] | undefined;
  return embedding ?? [];
}

function assertHttp(
  client: EmbeddingsAwsBedrockHttpClient | null,
): asserts client is EmbeddingsAwsBedrockHttpClient {
  if (!client) {
    throw new Error("Bedrock HTTP client not configured — embeddingsAwsBedrock executor cannot run without an out-of-process transport.");
  }
}

async function embedTexts(
  config: {
    model: string;
    region: string;
    baseUrl: string;
    client: EmbeddingsAwsBedrockHttpClient | null;
    creds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string };
  },
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];
  assertHttp(config.client);

  const { modelFamily, body: reqBody } = buildRequestBody(config.model, texts);

  if (modelFamily === "cohere") {
    const respBody = await callInvokeModel(
      config.client,
      config.model,
      reqBody,
      config.baseUrl,
      config.creds,
    );
    const b = respBody as Record<string, unknown>;
    const embeddings = (b.embeddings ?? []) as number[][];
    return embeddings;
  }

  const results: number[][] = [];
  for (const text of texts) {
    const respBody = await callInvokeModel(
      config.client,
      config.model,
      { inputText: text },
      config.baseUrl,
      config.creds,
    );
    const vec = parseResponseBody(config.model, respBody);
    results.push(vec);
  }
  return results;
}

export const embeddingsAwsBedrockExecutor: NodeExecutor = async (ctx) => {
  const authentication = resolveString(ctx, "authentication", "iam");
  const http = httpOverride;

  let resolvedCreds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string };

  if (authentication === "assumeRole") {
    const assumeCred = await requireCredential(ctx, "awsAssumeRole");
    const roleArn = String(assumeCred.roleArn ?? "");
    if (!roleArn) {
      throw new Error('awsAssumeRole credential missing roleArn');
    }
    const externalId = String(assumeCred.externalId ?? "");
    const region = String(assumeCred.region ?? DEFAULT_REGION);
    const roleSessionName = String(assumeCred.roleSessionName ?? "n8n-session");

    const stsCreds: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
      region: string;
    } = {
      accessKeyId: String(assumeCred.stsAccessKeyId ?? assumeCred.accessKeyId ?? ""),
      secretAccessKey: String(assumeCred.stsSecretAccessKey ?? assumeCred.secretAccessKey ?? ""),
      sessionToken: String(assumeCred.stsSessionToken ?? "") || undefined,
      region,
    };

    const tempCreds = await stsAssumeRole(http, stsCreds, roleArn, externalId, roleSessionName);
    resolvedCreds = {
      accessKeyId: tempCreds.accessKeyId,
      secretAccessKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      region,
    };
  } else {
    const awsCred = await requireCredential(ctx, "aws");
    const accessKeyId = String(awsCred.accessKeyId ?? "");
    if (!accessKeyId) {
      throw new Error('aws credential missing accessKeyId');
    }
    const secretAccessKey = String(awsCred.secretAccessKey ?? "");
    const sessionToken = String(awsCred.sessionToken ?? "") || undefined;
    const region = String(awsCred.region ?? DEFAULT_REGION);
    resolvedCreds = { accessKeyId, secretAccessKey, sessionToken, region };
  }

  const model = resolveModel(ctx);

  const rawCred = authentication === "assumeRole"
    ? await requireCredential(ctx, "awsAssumeRole")
    : await requireCredential(ctx, "aws");
  const credCustomEndpoints = (rawCred as Record<string, unknown>).customEndpoints as
    | Record<string, string>
    | undefined;
  const customBedrockRuntime = credCustomEndpoints?.bedrockRuntime;
  const baseUrl = customBedrockRuntime ?? `https://bedrock-runtime.${resolvedCreds.region}.amazonaws.com`;

  const config = {
    model,
    region: resolvedCreds.region,
    baseUrl,
    client: http,
    creds: resolvedCreds,
  };

  const handle: EmbeddingsAwsBedrockHandle = {
    type: "@n8n/n8n-nodes-langchain.embeddingsAwsBedrock",
    model,
    region: resolvedCreds.region,
    customEndpoint: customBedrockRuntime ?? null,
    async embedQuery(text: string): Promise<number[]> {
      const vectors = await embedTexts(config, [text]);
      return vectors[0] ?? [];
    },
    async embedDocuments(texts: string[]): Promise<number[][]> {
      return embedTexts(config, texts);
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
