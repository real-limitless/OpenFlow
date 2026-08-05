import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
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
  if (!cred) throw new Error('AWS Textract: credential "aws" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS Textract: accessKeyId and secretAccessKey are required");
  }
  return { region, accessKeyId, secretAccessKey, sessionToken };
}

async function textractRequest(
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  body: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const service = "textract";
  const region = creds.region;
  const host = `textract.${region}.amazonaws.com`;
  const bodyHash = await sha256(body ?? "");

  const headers: Record<string, string> = {
    host,
    "content-type": "application/x-amz-json-1.1",
    "x-amz-target": "Textract.AnalyzeExpense",
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

  const allHeaders: Record<string, string> = sigHeaders;
  const url = `https://${host}/`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const init: RequestInit = { method: "POST", headers: allHeaders, body, signal: controller.signal };
    const response = await fetch(url, init);
    const text = await response.text();
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });
    return { status: response.status, body: text, headers: respHeaders };
  } finally {
    clearTimeout(timer);
  }
}

export const awsTextractExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const params = node.parameters as Record<string, unknown>;
  const documentType = String(params.documentType ?? "binary");
  const paramRegion = String(params.region ?? "");

  const creds = await getAwsCreds(ctx);
  if (paramRegion) {
    creds.region = paramRegion;
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const document: Record<string, unknown> = {};
      const binaryPropertyName = String(resolveValue(params.binaryPropertyName ?? "data", itemJson));
      const bucketName = String(resolveValue(params.bucketName ?? "", itemJson));
      const keyName = String(resolveValue(params.keyName ?? "", itemJson));
      const version = String(resolveValue(params.version ?? "", itemJson));

      if (documentType === "binary") {
        const bin = item.binary?.[binaryPropertyName];
        if (!bin || !bin.data) {
          throw new Error(`AWS Textract: binary property "${binaryPropertyName}" not found or empty`);
        }
        document.Bytes = bin.data;
      } else {
        if (!bucketName || !keyName) {
          throw new Error("AWS Textract: bucketName and keyName are required for S3Object document type");
        }
        const s3Object: Record<string, unknown> = { Bucket: bucketName, Name: keyName };
        if (version) s3Object.Version = version;
        document.S3Object = s3Object;
      }

      const requestBody = JSON.stringify({ Document: document });
      const response = await textractRequest(creds, requestBody);

      if (response.status < 200 || response.status >= 300) {
        const errorDetail = tryParseError(response.body);
        throw new Error(`AWS Textract: AnalyzeExpense failed (${response.status}): ${errorDetail}`);
      }

      const parsed = JSON.parse(response.body);
      out.push({ json: parsed, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }
  return [out];
};

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
