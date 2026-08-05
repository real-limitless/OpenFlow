import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function sha256(data: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)).then((h) =>
    Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  return crypto.subtle
    .importKey("raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((cryptoKey) =>
      crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)).then((h) => new Uint8Array(h)),
    );
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function hex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signRequest(opts: {
  method: string;
  region: string;
  service: string;
  host: string;
  path: string;
  queryString: string;
  headers: Record<string, string>;
  bodyHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const allHeaders: Record<string, string> = {
    host: opts.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": opts.bodyHash,
    ...(opts.sessionToken ? { "x-amz-security-token": opts.sessionToken } : {}),
    ...opts.headers,
  };

  const canonical = Object.entries(allHeaders)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = canonical.map(([k]) => k).join(";");

  const canonicalRequest = [
    opts.method,
    opts.path,
    opts.queryString,
    ...canonical.map(([k, v]) => `${k}:${v}`),
    "",
    signedHeaders,
    opts.bodyHash,
  ].join("\n");
  const canonicalHash = await sha256(canonicalRequest);
  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalHash].join("\n");
  const signingKey = await getSignatureKey(opts.secretAccessKey, dateStamp, opts.region, opts.service);
  const signature = hex(await hmacSha256(signingKey, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const { host: _host, ...wireHeaders } = allHeaders;
  return { ...wireHeaders, authorization };
}

async function getAwsCreds(ctx: ExecutionContext): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}> {
  const cred = await ctx.getCredential("aws");
  if (!cred) throw new Error('AWS Rekognition: credential "aws" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS Rekognition: accessKeyId and secretAccessKey are required");
  }
  return { region, accessKeyId, secretAccessKey, sessionToken };
}

const API_ACTIONS: Record<string, string> = {
  detectLabels: "RekognitionService.DetectLabels",
  detectFaces: "RekognitionService.DetectFaces",
  detectModerationLabels: "RekognitionService.DetectModerationLabels",
  detectText: "RekognitionService.DetectText",
  recognizeCelebrity: "RekognitionService.RecognizeCelebrities",
};

async function rekognitionRequest(
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  body: string,
  apiAction: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const service = "rekognition";
  const region = creds.region;
  const host = `rekognition.${region}.amazonaws.com`;
  const bodyHash = await sha256(body ?? "");

  const headers: Record<string, string> = {
    host,
    "content-type": "application/x-amz-json-1.1",
    "x-amz-target": apiAction,
  };

  const sigHeaders = await signRequest({
    method: "POST",
    region,
    service,
    host,
    path: "/",
    queryString: "",
    headers,
    bodyHash,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  });

  const url = `https://${host}/`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const init: RequestInit = { method: "POST", headers: sigHeaders, body, signal: controller.signal };
    const response = await fetch(url, init);
    const text = await response.text();
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });
    return { status: response.status, body: text, headers: respHeaders };
  } finally {
    clearTimeout(timer);
  }
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function tryParseError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed.message ?? parsed.Message ?? body;
  } catch {
    return body;
  }
}

export const awsRekognitionExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const params = node.parameters as Record<string, unknown>;
  const analysisType = String(params.type ?? "detectLabels");
  const binaryData = params.binaryData === true || params.binaryData === "true";

  const creds = await getAwsCreds(ctx);

  const apiAction = API_ACTIONS[analysisType];
  if (!apiAction) {
    throw new Error(`AWS Rekognition: unsupported analysis type "${analysisType}"`);
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const image: Record<string, unknown> = {};

      if (binaryData) {
        const binaryPropertyName = String(resolveValue(params.binaryPropertyName ?? "data", itemJson));
        const bin = item.binary?.[binaryPropertyName];
        if (!bin || !bin.data) {
          throw new Error(`AWS Rekognition: binary property "${binaryPropertyName}" not found or empty`);
        }
        image.Bytes = bin.data;
      } else {
        const bucket = String(resolveValue(params.bucket ?? "", itemJson));
        const name = String(resolveValue(params.name ?? "", itemJson));
        if (!bucket || !name) {
          throw new Error("AWS Rekognition: bucket and name are required when binaryData is false");
        }
        image.S3Object = { Bucket: bucket, Name: name };
      }

      const requestBody: Record<string, unknown> = { Image: image };

      const additionalFields = params.additionalFields as Record<string, unknown> | undefined;
      if (additionalFields) {
        const af = additionalFields;
        if (af.maxLabels) requestBody.MaxLabels = af.maxLabels;
        if (af.minConfidence) requestBody.MinConfidence = af.minConfidence;
        if (af.version) requestBody.ModelVersion = af.version;
        if (af.wordFilter) requestBody.Filters = { WordFilter: { MinConfidence: 0 } };
        if (af.regionsOfInterest) {
          requestBody.RegionsOfInterest = af.regionsOfInterest;
        }
        if (af.attributes) {
          requestBody.Attributes = Array.isArray(af.attributes)
            ? af.attributes
            : [String(af.attributes)];
        }
      }

      const response = await rekognitionRequest(creds, JSON.stringify(requestBody), apiAction);

      if (response.status < 200 || response.status >= 300) {
        const errorDetail = tryParseError(response.body);
        throw new Error(`AWS Rekognition: ${analysisType} failed (${response.status}): ${errorDetail}`);
      }

      const parsed = JSON.parse(response.body);
      out.push({ json: { ...itemJson, rekognitionResult: parsed }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, error: message }, pairedItem });
    }
  }
  return [out];
};
