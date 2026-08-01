import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";

function sha256(data: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)).then((h) =>
    Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );
}

function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  return crypto.subtle
    .importKey("raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((cryptoKey) =>
      crypto.subtle
        .sign("HMAC", cryptoKey, new TextEncoder().encode(data))
        .then((h) => new Uint8Array(h)),
    );
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function hex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  const amzDate = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const signedHeaders = Object.keys(opts.headers)
    .sort()
    .map((k) => k.toLowerCase())
    .join(";");
  const canonicalRequest = [
    opts.method,
    opts.path,
    opts.queryString,
    ...Object.entries(opts.headers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k.toLowerCase()}:${v}`),
    "",
    signedHeaders,
    opts.bodyHash,
  ].join("\n");
  const canonicalHash = await sha256(canonicalRequest);
  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalHash].join("\n");
  const signingKey = await getSignatureKey(
    opts.secretAccessKey,
    dateStamp,
    opts.region,
    opts.service,
  );
  const signature = hex(await hmacSha256(signingKey, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const outHeaders: Record<string, string> = { "x-amz-date": amzDate, authorization };
  if (opts.sessionToken) outHeaders["x-amz-security-token"] = opts.sessionToken;
  return outHeaders;
}

export const awsSesExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const params = ctx.getParams();
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("aws");
  if (!cred) throw new Error('AWS SES: credential "aws" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS SES: accessKeyId and secretAccessKey are required");
  }

  const results: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const to = String(params.to ?? itemJson.to ?? "");
      const subject = String(params.subject ?? itemJson.subject ?? "");
      const text = String(params.text ?? itemJson.text ?? "");
      const html = String(params.html ?? itemJson.html ?? "");
      const from = String(params.from ?? itemJson.from ?? "");
      const template = String(params.template ?? itemJson.template ?? "");

      if (!to) throw new Error('AWS SES: "to" is required');
      if (!from) throw new Error('AWS SES: "from" is required');
      if (!template && !subject.trim()) throw new Error('AWS SES: "subject" is required');

      let bodyStr: string;
      let contentHash: string;

      if (template) {
        bodyStr = JSON.stringify({
          Template: template,
          Destination: { ToAddresses: to.split(",").map((s: string) => s.trim()) },
          Source: from,
          TemplateData: JSON.stringify({ subject, html, text }),
        });
        contentHash = await sha256(bodyStr);
        const host = `email.${region}.amazonaws.com`;
        const path = "/";
        const queryString = "Action=SendTemplatedEmail&Version=2010-12-01";
        const qsBody = buildFormBody({
          Action: "SendTemplatedEmail",
          Version: "2010-12-01",
          Source: from,
          "Destination.ToAddresses.member.1": to.split(",")[0].trim(),
          Template: template,
          TemplateData: JSON.stringify({ subject, html, text }),
        });
        contentHash = await sha256(qsBody);
        const headers: Record<string, string> = {
          host,
          "content-type": "application/x-www-form-urlencoded",
        };
        const sigHeaders = await signRequest({
          method: "POST",
          region,
          service: "email",
          host,
          path,
          queryString: "",
          headers,
          bodyHash: contentHash,
          accessKeyId,
          secretAccessKey,
          sessionToken,
        });
        const resp = await fetch(`https://${host}${path}`, {
          method: "POST",
          headers: { ...headers, ...sigHeaders },
          body: qsBody,
        });
        const respText = await resp.text();
        if (!resp.ok) throw new Error(`AWS SES: ${resp.status} ${respText}`);
        results.push({
          json: { success: true, messageId: extractMessageId(respText) },
          pairedItem,
        });
      } else if (html || text) {
        const boundary = `_=${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const attachments = String(params.attachments ?? itemJson.attachments ?? "");
        const rawMessage = buildMimeMessage(to, from, subject, text, html, boundary, attachments, item.binary);
        bodyStr = rawMessage;
        contentHash = await sha256(rawMessage);
        const host = `email.${region}.amazonaws.com`;
        const path = "/";
        const headers: Record<string, string> = {
          host,
          "content-type": "message/rfc822",
          "content-length": String(new TextEncoder().encode(rawMessage).length),
        };
        const sigHeaders = await signRequest({
          method: "POST",
          region,
          service: "email",
          host,
          path,
          queryString: "",
          headers,
          bodyHash: contentHash,
          accessKeyId,
          secretAccessKey,
          sessionToken,
        });
        const resp = await fetch(`https://${host}${path}`, {
          method: "POST",
          headers: { ...headers, ...sigHeaders },
          body: rawMessage,
        });
        const respText = await resp.text();
        if (!resp.ok) throw new Error(`AWS SES: ${resp.status} ${respText}`);
        results.push({
          json: { success: true, messageId: extractMessageId(respText) },
          pairedItem,
        });
      } else {
        throw new Error('AWS SES: either "html", "text", or "template" is required');
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      results.push({ json: { error: message, success: false }, pairedItem });
    }
  }

  return [results];
};

function buildMimeMessage(
  to: string,
  from: string,
  subject: string,
  text: string,
  html: string,
  boundary: string,
  attachments?: string,
  binaryData?: Record<string, IBinaryData>,
): string {
  const toAddresses = to.split(",").map((s: string) => s.trim());
  const hasAttachments = attachments && binaryData;
  const lines: string[] = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${toAddresses.join(", ")}`);
  lines.push(`Subject: ${subject}`);
  lines.push("MIME-Version: 1.0");

  if (hasAttachments) {
    const attachmentNames = attachments.split(",").map((s: string) => s.trim()).filter(Boolean);
    const mixedBoundary = `mixed_${boundary}`;
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    lines.push("");
    lines.push(`--${mixedBoundary}`);
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    if (text) {
      lines.push(`--${boundary}`);
      lines.push("Content-Type: text/plain; charset=UTF-8");
      lines.push("");
      lines.push(text);
      lines.push("");
    }
    if (html) {
      lines.push(`--${boundary}`);
      lines.push("Content-Type: text/html; charset=UTF-8");
      lines.push("");
      lines.push(html);
      lines.push("");
    }
    lines.push(`--${boundary}--`);
    for (const name of attachmentNames) {
      const bin = binaryData[name];
      if (!bin) continue;
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: ${bin.mimeType ?? "application/octet-stream"}; name="${bin.fileName ?? name}"`);
      lines.push("Content-Transfer-Encoding: base64");
      lines.push(`Content-Disposition: attachment; filename="${bin.fileName ?? name}"`);
      lines.push("");
      lines.push(bin.data);
      lines.push("");
    }
    lines.push(`--${mixedBoundary}--`);
  } else {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    if (text) {
      lines.push(`--${boundary}`);
      lines.push("Content-Type: text/plain; charset=UTF-8");
      lines.push("");
      lines.push(text);
      lines.push("");
    }
    if (html) {
      lines.push(`--${boundary}`);
      lines.push("Content-Type: text/html; charset=UTF-8");
      lines.push("");
      lines.push(html);
      lines.push("");
    }
    lines.push(`--${boundary}--`);
  }
  return lines.join("\r\n");
}

function buildFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function extractMessageId(xml: string): string {
  const m = xml.match(/<MessageId>([^<]+)<\/MessageId>/);
  return m ? m[1] : "";
}
