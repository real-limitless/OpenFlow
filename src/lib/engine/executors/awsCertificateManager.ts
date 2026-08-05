import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

interface AwsCreds {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

async function getAwsCreds(ctx: ExecutionContext): Promise<AwsCreds> {
  let cred = await ctx.getCredential("aws");
  if (!cred) cred = await ctx.getCredential("awsAssumeRole");
  if (!cred) throw new Error('ACM: credential "aws" or "awsAssumeRole" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("ACM: accessKeyId and secretAccessKey are required");
  }
  return { region, accessKeyId, secretAccessKey, sessionToken };
}

function sha256(data: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(data))
    .then((h) =>
      Array.from(new Uint8Array(h))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
}

function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const buf = new Uint8Array(key);
  return (crypto.subtle as SubtleCrypto)
    .importKey("raw", buf.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((cryptoKey) =>
      (crypto.subtle as SubtleCrypto)
        .sign("HMAC", cryptoKey, new TextEncoder().encode(data))
        .then((h) => new Uint8Array(h)),
    );
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
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

  return { ...headers, authorization };
}

async function acmRequest(
  creds: AwsCreds,
  action: string,
  bodyParams: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  const service = "acm";
  const host = `acm.${creds.region}.amazonaws.com`;
  const body = JSON.stringify({ Action: action, Version: "2015-12-08", ...bodyParams });
  const bodyHash = await sha256(body);

  const sigHeaders = await signRequest({
    method: "POST",
    region: creds.region,
    service,
    host,
    path: "/",
    queryString: "",
    headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": `CertificateManager.${action}` },
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
      headers: { ...sigHeaders, "content-type": "application/x-amz-json-1.1", "x-amz-target": `CertificateManager.${action}` },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, body: text };
  } finally {
    clearTimeout(timer);
  }
}

function parseAcmResponse(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { raw: body };
  }
}

function extractCertificate(json: Record<string, unknown>): Record<string, unknown> {
  const cert = json.Certificate as Record<string, unknown> | undefined;
  if (cert) return cert;
  return json;
}

function extractCertificates(json: Record<string, unknown>): Record<string, unknown>[] {
  const summaries = json.CertificateSummaryList;
  if (Array.isArray(summaries)) return summaries as Record<string, unknown>[];
  return [];
}

export const awsCertificateManagerExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters as Record<string, unknown>;
  const resource = String(params.resource ?? "certificate");
  const operation = String(params.operation ?? "renew");
  const continueOnFail = ctx.continueOnFail();

  const creds = await getAwsCreds(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(creds, resource, operation, params);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }
  return [out];
};

async function runOperation(
  creds: AwsCreds,
  resource: string,
  operation: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (resource !== "certificate") {
    throw new Error(`ACM: unsupported resource "${resource}"`);
  }

  const certificateArn = String(params.certificateArn ?? "");

  switch (operation) {
    case "get": {
      if (!certificateArn) throw new Error("ACM: certificateArn is required for get");
      const res = await acmRequest(creds, "DescribeCertificate", { CertificateArn: certificateArn });
      if (res.status < 200 || res.status >= 300) {
        const parsed = parseAcmResponse(res.body);
        throw new Error(`ACM API error: ${String(parsed.message ?? res.body)}`);
      }
      const parsed = extractCertificate(parseAcmResponse(res.body));
      return parsed;
    }
    case "getMetadata": {
      if (!certificateArn) throw new Error("ACM: certificateArn is required for getMetadata");
      const res = await acmRequest(creds, "DescribeCertificate", { CertificateArn: certificateArn });
      if (res.status < 200 || res.status >= 300) {
        const parsed = parseAcmResponse(res.body);
        throw new Error(`ACM API error: ${String(parsed.message ?? res.body)}`);
      }
      const parsed = parseAcmResponse(res.body);
      const cert = parsed.Certificate as Record<string, unknown> | undefined;
      if (cert) {
        const metadata = { ...cert };
        delete metadata.CertificateBody;
        delete metadata.CertificateChain;
        return metadata;
      }
      return parsed as Record<string, unknown>;
    }
    case "getMany": {
      const returnAll = Boolean(params.returnAll);
      const limit = Number(params.limit ?? 100);
      const options = (params.options as Record<string, unknown>) ?? {};
      const bodyParams: Record<string, unknown> = {};
      const statuses = options.certificateStatuses;
      if (Array.isArray(statuses) && statuses.length > 0) {
        bodyParams.CertificateStatuses = statuses;
      }
      const keyTypes = options.keyTypes;
      if (Array.isArray(keyTypes) && keyTypes.length > 0) {
        bodyParams.KeyTypes = keyTypes;
      }
      const extendedKeyUsage = options.extendedKeyUsage;
      if (Array.isArray(extendedKeyUsage) && extendedKeyUsage.length > 0) {
        bodyParams.ExtendedKeyUsage = extendedKeyUsage;
      }
      const keyUsage = options.keyUsage;
      if (Array.isArray(keyUsage) && keyUsage.length > 0) {
        bodyParams.KeyUsage = keyUsage;
      }
      if (!returnAll) {
        bodyParams.MaxItems = String(Math.min(limit, 500));
      }
      const certs: Record<string, unknown>[] = [];
      let nextToken: string | undefined;
      do {
        if (nextToken) bodyParams.NextToken = nextToken;
        const res = await acmRequest(creds, "ListCertificates", bodyParams);
        if (res.status < 200 || res.status >= 300) {
          const parsed = parseAcmResponse(res.body);
          throw new Error(`ACM API error: ${String(parsed.message ?? res.body)}`);
        }
        const parsed = parseAcmResponse(res.body);
        const batch = extractCertificates(parsed);
        certs.push(...batch);
        nextToken = parsed.NextToken as string | undefined;
        if (!returnAll && certs.length >= limit) {
          certs.splice(limit);
          break;
        }
      } while (nextToken);
      return certs;
    }
    case "delete": {
      if (!certificateArn) throw new Error("ACM: certificateArn is required for delete");
      const res = await acmRequest(creds, "DeleteCertificate", { CertificateArn: certificateArn });
      if (res.status < 200 || res.status >= 300) {
        const parsed = parseAcmResponse(res.body);
        throw new Error(`ACM API error: ${String(parsed.message ?? res.body)}`);
      }
      return {};
    }
    case "renew": {
      if (!certificateArn) throw new Error("ACM: certificateArn is required for renew");
      const res = await acmRequest(creds, "RenewCertificate", { CertificateArn: certificateArn });
      if (res.status < 200 || res.status >= 300) {
        const parsed = parseAcmResponse(res.body);
        throw new Error(`ACM API error: ${String(parsed.message ?? res.body)}`);
      }
      return {};
    }
    default:
      throw new Error(`ACM: unsupported operation "${operation}"`);
  }
}
