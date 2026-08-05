import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, withPairedItem } from "@/sdk";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const ctx = { json: itemJson };
    const result = evaluateExpression(raw, ctx);
    return result.ok ? result.value : raw;
  }
  return raw;
}

function getParam(params: Record<string, unknown>, name: string, itemJson: Record<string, unknown>, defaultVal: unknown = ""): unknown {
  const raw = params[name];
  if (raw === undefined) return defaultVal;
  return resolveValue(raw, itemJson);
}

function evaluateExpression(expr: string, ctx: { json: Record<string, unknown> }): { ok: boolean; value: unknown } {
  try {
    const fn = new Function("$json", "return " + expr.replace(/^\=/, ""));
    const value = fn(ctx.json);
    return { ok: true, value };
  } catch {
    return { ok: false, value: expr };
  }
}

async function getAwsCreds(ctx: ExecutionContext): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}> {
  const cred = await ctx.getCredential("aws");
  if (!cred) throw new Error('AWS SQS: credential "aws" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS SQS: accessKeyId and secretAccessKey are required");
  }
  return { region, accessKeyId, secretAccessKey, sessionToken };
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

  const headers: Record<string, string> = {
    host: opts.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": opts.bodyHash,
    ...(opts.sessionToken ? { "x-amz-security-token": opts.sessionToken } : {}),
    ...opts.headers,
  };

  const canonical = Object.entries(headers)
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

  const { host: _host, ...wireHeaders } = headers;
  return { ...wireHeaders, authorization };
}

async function sqsRequest(
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  queueUrl: string,
  body: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const service = "sqs";
  const url = new URL(queueUrl);
  const host = url.host;

  const bodyHash = await sha256(body);

  const headers: Record<string, string> = {
    host,
    "content-type": "application/x-www-form-urlencoded",
  };

  const sigHeaders = await signRequest({
    method: "POST",
    region: creds.region,
    service,
    host,
    path: url.pathname,
    queryString: url.search.replace(/^\?/, ""),
    headers,
    bodyHash,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  });

  const allHeaders: Record<string, string> = sigHeaders;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(queueUrl, {
      method: "POST",
      headers: allHeaders,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });
    return { status: response.status, body: text, headers: respHeaders };
  } finally {
    clearTimeout(timer);
  }
}

function parseXmlSimple(xml: string): Record<string, unknown> {
  const strip = xml.replace(/\s*<\?xml[^>]*>\s*/i, "");
  const out: Record<string, unknown> = {};
  const tagRe = /<(\w+)[^>]*>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(strip)) !== null) {
    const child = match[2].trim();
    if (child.includes("<")) {
      const inner = parseXmlSimple(child);
      if (out[match[1]]) {
        if (!Array.isArray(out[match[1]])) out[match[1]] = [out[match[1]]];
        (out[match[1]] as Record<string, unknown>[]).push(inner);
      } else {
        out[match[1]] = inner;
      }
    } else {
      if (out[match[1]]) {
        if (!Array.isArray(out[match[1]])) out[match[1]] = [out[match[1]]];
        (out[match[1]] as string[]).push(child);
      } else {
        out[match[1]] = child;
      }
    }
  }
  if (Object.keys(out).length === 0) return { value: strip };
  return out;
}

function unwrapXmlRoot(parsed: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(parsed);
  if (keys.length !== 1) return parsed;
  const only = parsed[keys[0]];
  if (!only || typeof only !== "object" || Array.isArray(only)) return parsed;
  return only as Record<string, unknown>;
}

interface SendMessageResponse {
  messageId: string;
  md5OfMessageBody: string;
  md5OfMessageAttributes?: string;
  md5OfMessageSystemAttributes?: string;
  sequenceNumber?: string;
}

function parseSendMessageResponse(xml: string): SendMessageResponse {
  const root = unwrapXmlRoot(parseXmlSimple(xml));
  return {
    messageId: String(root.MessageId ?? ""),
    md5OfMessageBody: String(root.MD5OfMessageBody ?? ""),
    md5OfMessageAttributes: root.MD5OfMessageAttributes ? String(root.MD5OfMessageAttributes) : undefined,
    md5OfMessageSystemAttributes: root.MD5OfMessageSystemAttributes ? String(root.MD5OfMessageSystemAttributes) : undefined,
    sequenceNumber: root.SequenceNumber ? String(root.SequenceNumber) : undefined,
  };
}

function buildSendMessageBody(params: Record<string, unknown>, itemJson: Record<string, unknown>): string {
  const parts: string[] = [];
  parts.push("Action=SendMessage");

  const sendInputData = params.sendInputData !== false;

  if (sendInputData) {
    const messageBody = JSON.stringify(itemJson);
    parts.push(`MessageBody=${encodeURIComponent(messageBody)}`);
  } else {
    const message = String(getParam(params, "message", itemJson) ?? "");
    parts.push(`MessageBody=${encodeURIComponent(message)}`);
  }

  const queueUrl = String(getParam(params, "queue", itemJson) ?? "");
  parts.push(`QueueUrl=${encodeURIComponent(queueUrl)}`);

  const queueType = String(params.queueType ?? "standard");
  if (queueType === "fifo") {
    const messageGroupId = String(getParam(params, "messageGroupId", itemJson) ?? "");
    if (messageGroupId) {
      parts.push(`MessageGroupId=${encodeURIComponent(messageGroupId)}`);
    }
  }

  const options = (params.options ?? {}) as Record<string, unknown>;

  const delaySeconds = Number(getParam(options, "delaySeconds", itemJson, 0));
  if (delaySeconds > 0 && queueType === "standard") {
    parts.push(`DelaySeconds=${delaySeconds}`);
  }

  if (queueType === "fifo") {
    const dedupId = String(getParam(options, "messageDeduplicationId", itemJson) ?? "");
    if (dedupId) {
      parts.push(`MessageDeduplicationId=${encodeURIComponent(dedupId)}`);
    }
  }

  const messageAttributes = options.messageAttributes as Record<string, unknown> | undefined;
  if (messageAttributes) {
    let attrIndex = 1;
    const stringEntries = (messageAttributes.string as Array<Record<string, unknown>> | undefined) ?? [];
    for (const entry of stringEntries) {
      const name = String(entry.name ?? "");
      const value = String(entry.value ?? "");
      if (name) {
        parts.push(`MessageAttribute.${attrIndex}.Name=${encodeURIComponent(name)}`);
        parts.push(`MessageAttribute.${attrIndex}.Value.DataType=String`);
        parts.push(`MessageAttribute.${attrIndex}.Value.StringValue=${encodeURIComponent(value)}`);
        attrIndex++;
      }
    }
    const numberEntries = (messageAttributes.number as Array<Record<string, unknown>> | undefined) ?? [];
    for (const entry of numberEntries) {
      const name = String(entry.name ?? "");
      const value = String(entry.value ?? "");
      if (name) {
        parts.push(`MessageAttribute.${attrIndex}.Name=${encodeURIComponent(name)}`);
        parts.push(`MessageAttribute.${attrIndex}.Value.DataType=Number`);
        parts.push(`MessageAttribute.${attrIndex}.Value.StringValue=${encodeURIComponent(value)}`);
        attrIndex++;
      }
    }
    const binaryEntries = (messageAttributes.binary as Array<Record<string, unknown>> | undefined) ?? [];
    for (const entry of binaryEntries) {
      const name = String(entry.name ?? "");
      const dataPropertyName = String(entry.dataPropertyName ?? "");
      if (name && dataPropertyName) {
        parts.push(`MessageAttribute.${attrIndex}.Name=${encodeURIComponent(name)}`);
        parts.push(`MessageAttribute.${attrIndex}.Value.DataType=Binary`);
        parts.push(`MessageAttribute.${attrIndex}.Value.BinaryValue=${encodeURIComponent(dataPropertyName)}`);
        attrIndex++;
      }
    }
  }

  return parts.join("&");
}

export const awsSqsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters as Record<string, unknown>;
  const continueOnFail = ctx.continueOnFail();

  const creds = await getAwsCreds(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const queueUrl = String(getParam(params, "queue", itemJson) ?? "");
      if (!queueUrl) throw new Error("AWS SQS: queue URL is required");

      const requestBody = buildSendMessageBody(params, itemJson);
      const response = await sqsRequest(creds, queueUrl, requestBody);

      if (response.status < 200 || response.status >= 300) {
        const errorCode = extractErrorCode(response.body);
        throw new Error(`AWS SQS: SendMessage failed (${response.status}): ${errorCode}`);
      }

      const parsed = parseSendMessageResponse(response.body);
      const outputJson: Record<string, unknown> = {
        messageId: parsed.messageId,
        md5OfMessageBody: parsed.md5OfMessageBody,
      };
      if (parsed.md5OfMessageAttributes) outputJson.md5OfMessageAttributes = parsed.md5OfMessageAttributes;
      if (parsed.md5OfMessageSystemAttributes) outputJson.md5OfMessageSystemAttributes = parsed.md5OfMessageSystemAttributes;
      if (parsed.sequenceNumber) outputJson.sequenceNumber = parsed.sequenceNumber;

      out.push({ json: { ...itemJson, ...outputJson }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

function extractErrorCode(xml: string): string {
  const match = xml.match(/<Code>([^<]+)<\/Code>/);
  return match ? match[1] : xml.slice(0, 200);
}
