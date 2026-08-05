import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

async function getAwsCreds(ctx: ExecutionContext): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}> {
  const cred = await ctx.getCredential("aws");
  const assumeCred = await ctx.getCredential("awsAssumeRole");

  if (assumeCred) {
    const region = String(assumeCred.region ?? "us-east-1");
    const accessKeyId = String(assumeCred.stsAccessKeyId ?? "");
    const secretAccessKey = String(assumeCred.stsSecretAccessKey ?? "");
    const roleArn = String(assumeCred.roleArn ?? "");
    const roleSessionName = String(assumeCred.roleSessionName ?? "n8n-session");
    const externalId = assumeCred.externalId ? String(assumeCred.externalId) : undefined;
    if (!accessKeyId || !secretAccessKey || !roleArn) {
      throw new Error("AWS SNS: stsAccessKeyId, stsSecretAccessKey, and roleArn are required for assume-role");
    }
    const sessionToken = assumeCred.sessionToken ? String(assumeCred.sessionToken) : undefined;
    return { region, accessKeyId, secretAccessKey, sessionToken };
  }

  if (cred) {
    const region = String(cred.region ?? "us-east-1");
    const accessKeyId = String(cred.accessKeyId ?? "");
    const secretAccessKey = String(cred.secretAccessKey ?? "");
    const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS SNS: accessKeyId and secretAccessKey are required");
    }
    return { region, accessKeyId, secretAccessKey, sessionToken };
  }

  throw new Error('AWS SNS: credential "aws" or "awsAssumeRole" is not configured');
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
    "content-type": "application/x-amz-json-1.1",
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

async function snsRequest(
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  action: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  const service = "sns";
  const host = `sns.${creds.region}.amazonaws.com`;
  const bodyStr = JSON.stringify(payload);
  const bodyHash = await sha256(bodyStr);

  const sigHeaders = await signRequest({
    method: "POST",
    region: creds.region,
    service,
    host,
    path: "/",
    queryString: "",
    headers: {
      "x-amz-target": `SNSMobilePush.${action}`,
    },
    bodyHash,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  });

  const url = `https://${host}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: sigHeaders,
      body: bodyStr,
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, body: text };
  } finally {
    clearTimeout(timer);
  }
}

function parseSnsResponse(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const tagRe = /<(\w+)>([^<]*)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(xml)) !== null) {
    const inner = match[2].trim();
    if (inner) {
      out[match[1]] = inner;
    }
  }
  return out;
}

function getParam(params: Record<string, unknown>, name: string, defaultVal: unknown = ""): unknown {
  const raw = params[name];
  if (raw === undefined || raw === null) return defaultVal;
  return raw;
}

export const awsSnsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters as Record<string, unknown>;
  const topicType = String(params.topicType ?? "topicArn");
  const message = String(params.message ?? "");
  const subject = params.subject ? String(params.subject) : undefined;
  const messageStructure = String(params.messageStructure ?? "string");
  const messageDeduplicationId = params.messageDeduplicationId ? String(params.messageDeduplicationId) : undefined;
  const messageGroupId = params.messageGroupId ? String(params.messageGroupId) : undefined;
  const messageAttributes = params.messageAttributes as Record<string, unknown> | undefined;
  const continueOnFail = ctx.continueOnFail();

  if (!message) {
    throw new Error("AWS SNS: message is required");
  }

  let topicArn: string | undefined;
  let phoneNumber: string | undefined;
  let targetArn: string | undefined;

  if (topicType === "topicArn") {
    topicArn = String(params.topicArn ?? "");
    if (!topicArn) throw new Error("AWS SNS: topicArn is required when topicType is topicArn");
  } else if (topicType === "phoneNumber") {
    phoneNumber = String(params.phoneNumber ?? "");
    if (!phoneNumber) throw new Error("AWS SNS: phoneNumber is required when topicType is phoneNumber");
  } else if (topicType === "targetArn") {
    targetArn = String(params.targetArn ?? "");
    if (!targetArn) throw new Error("AWS SNS: targetArn is required when topicType is targetArn");
  }

  const creds = await getAwsCreds(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const publishPayload: Record<string, unknown> = {
        Message: message,
      };
      if (topicArn) publishPayload.TopicArn = topicArn;
      if (phoneNumber) publishPayload.PhoneNumber = phoneNumber;
      if (targetArn) publishPayload.TargetArn = targetArn;
      if (subject) publishPayload.Subject = subject;
      if (messageStructure === "json") publishPayload.MessageStructure = "json";
      if (messageDeduplicationId) publishPayload.MessageDeduplicationId = messageDeduplicationId;
      if (messageGroupId) publishPayload.MessageGroupId = messageGroupId;

      const msgAttrValues = messageAttributes?.values as Array<Record<string, string>> | undefined;
      if (msgAttrValues && msgAttrValues.length > 0) {
        const attrs: Record<string, Record<string, string>> = {};
        for (const attr of msgAttrValues) {
          const attrName = attr.name;
          if (!attrName) continue;
          const attrType = attr.type ?? "String";
          attrs[attrName] = {
            DataType: attrType,
            ...(attrType === "Binary" ? { BinaryValue: attr.value } : { StringValue: attr.value }),
          };
        }
        if (Object.keys(attrs).length > 0) {
          publishPayload.MessageAttributes = attrs;
        }
      }

      const res = await snsRequest(creds, "Publish", publishPayload);

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`AWS SNS: Publish failed (${res.status}): ${res.body}`);
      }

      const parsed = parseSnsResponse(res.body);
      const result: Record<string, unknown> = {};

      if (parsed.MessageId) {
        result.messageId = parsed.MessageId;
      }
      if (parsed.SequenceNumber) {
        result.sequenceNumber = parsed.SequenceNumber;
      }

      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const messageText = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: messageText }, pairedItem });
    }
  }

  return [out];
};
