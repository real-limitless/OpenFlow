import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function sha256(data: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)).then((h) =>
    Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const buf = new Uint8Array(key);
  return (crypto.subtle as SubtleCrypto).importKey(
    "raw",
    buf.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  ).then((cryptoKey) =>
    (crypto.subtle as SubtleCrypto).sign("HMAC", cryptoKey, new TextEncoder().encode(data)).then((h) => new Uint8Array(h)),
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
  if (!cred) throw new Error('AWS Transcribe: credential "aws" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS Transcribe: accessKeyId and secretAccessKey are required");
  }
  return { region, accessKeyId, secretAccessKey, sessionToken };
}

async function transcribeRequest(
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  target: string,
  body: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const service = "transcribe";
  const region = creds.region;
  const host = `transcribe.${region}.amazonaws.com`;
  const bodyHash = await sha256(body ?? "");

  const headers: Record<string, string> = {
    host,
    "content-type": "application/x-amz-json-1.1",
    "x-amz-target": target,
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

function buildCreateBody(params: Record<string, unknown>, itemJson: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    TranscriptionJobName: String(resolveValue(params.transcriptionJobName, itemJson)),
    Media: { MediaFileUri: String(resolveValue(params.mediaFileUri, itemJson)) },
  };

  const lc = String(resolveValue(params.languageCode, itemJson) ?? "");
  const identifyLang = params.identifyLanguage === true || params.identifyLanguage === "true";
  const identifyMulti = params.identifyMultipleLanguages === true || params.identifyMultipleLanguages === "true";

  if (lc && !identifyLang && !identifyMulti) {
    body.LanguageCode = lc;
  }
  if (identifyLang) {
    body.IdentifyLanguage = true;
  }
  if (identifyMulti) {
    body.IdentifyMultipleLanguages = true;
  }

  const langOptions = params.languageOptions;
  if (langOptions && Array.isArray(langOptions) && langOptions.length > 0) {
    body.LanguageOptions = langOptions;
  }

  const mediaFormat = String(params.mediaFormat ?? "");
  if (mediaFormat && mediaFormat !== "auto") {
    body.MediaFormat = mediaFormat;
  }

  const sampleRate = params.mediaSampleRateHertz;
  if (sampleRate !== undefined && sampleRate !== null && sampleRate !== "") {
    body.MediaSampleRateHertz = Number(sampleRate);
  }

  const outputBucket = String(resolveValue(params.outputBucketName, itemJson) ?? "");
  const outputKey = String(resolveValue(params.outputKey, itemJson) ?? "");
  if (outputBucket) {
    const output: Record<string, unknown> = { BucketName: outputBucket };
    if (outputKey) output.Key = outputKey;
    const kmsId = String(resolveValue(params.outputEncryptionKMSKeyId, itemJson) ?? "");
    if (kmsId) output.KMSKeyId = kmsId;
    body.OutputBucketName = outputBucket;
    if (outputKey) body.OutputKey = outputKey;
    if (kmsId) body.OutputEncryptionKMSKeyId = kmsId;
  }

  const modelSettings = params.modelSettings;
  if (modelSettings && typeof modelSettings === "object") {
    body.ModelSettings = modelSettings;
  }

  const settings = params.settings;
  if (settings && typeof settings === "object") {
    body.Settings = settings;
  }

  const contentRedaction = params.contentRedaction;
  if (contentRedaction && typeof contentRedaction === "object") {
    body.ContentRedaction = contentRedaction;
  }

  const subtitles = params.subtitles;
  if (subtitles && typeof subtitles === "object") {
    body.Subtitles = subtitles;
  }

  const toxicityDetection = params.toxicityDetection;
  if (toxicityDetection && typeof toxicityDetection === "object") {
    body.ToxicityDetection = toxicityDetection;
  }

  const tags = params.tags;
  if (tags && typeof tags === "object") {
    body.Tags = tags;
  }

  const jobExecutionSettings = params.jobExecutionSettings;
  if (jobExecutionSettings && typeof jobExecutionSettings === "object") {
    body.JobExecutionSettings = jobExecutionSettings;
  }

  const languageIdSettings = params.languageIdSettings;
  if (languageIdSettings && typeof languageIdSettings === "object") {
    body.LanguageIdSettings = languageIdSettings;
  }

  return body;
}

function tryParseError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed.message ?? parsed.Message ?? body;
  } catch {
    return body;
  }
}

export const awsTranscribeExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const params = node.parameters as Record<string, unknown>;
  const operation = String(params.operation ?? "create");
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
      let response: { status: number; body: string; headers: Record<string, string> };

      switch (operation) {
        case "create": {
          const body = buildCreateBody(params, itemJson);
          response = await transcribeRequest(creds, "AWSTranscribe.StartTranscriptionJob", JSON.stringify(body));
          break;
        }
        case "get": {
          const jobName = String(resolveValue(params.transcriptionJobName, itemJson));
          const body = JSON.stringify({ TranscriptionJobName: jobName });
          response = await transcribeRequest(creds, "AWSTranscribe.GetTranscriptionJob", body);
          break;
        }
        case "getAll": {
          const listBody: Record<string, unknown> = {};
          const jobNameContains = String(resolveValue(params.jobNameContains, itemJson) ?? "");
          if (jobNameContains) listBody.JobNameContains = jobNameContains;
          const status = String(params.status ?? "");
          if (status) listBody.Status = status;
          const maxResults = params.maxResults !== undefined && params.maxResults !== null ? Number(params.maxResults) : 100;
          listBody.MaxResults = maxResults;
          const nextToken = String(resolveValue(params.nextToken, itemJson) ?? "");
          if (nextToken) listBody.NextToken = nextToken;
          response = await transcribeRequest(creds, "AWSTranscribe.ListTranscriptionJobs", JSON.stringify(listBody));
          break;
        }
        case "delete": {
          const jobName = String(resolveValue(params.transcriptionJobName, itemJson));
          const body = JSON.stringify({ TranscriptionJobName: jobName });
          response = await transcribeRequest(creds, "AWSTranscribe.DeleteTranscriptionJob", body);
          break;
        }
        default:
          throw new Error(`AWS Transcribe: unknown operation "${operation}"`);
      }

      if (response.status < 200 || response.status >= 300) {
        const errorDetail = tryParseError(response.body);
        throw new Error(`AWS Transcribe: ${operation} failed (${response.status}): ${errorDetail}`);
      }

      if (operation === "delete") {
        out.push({ json: { success: true }, pairedItem });
      } else {
        const parsed = JSON.parse(response.body);
        out.push({ json: parsed, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
