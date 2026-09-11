import { createHash, createHmac } from "node:crypto";

export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  source: "static" | "env" | "web-identity" | "ecs";
};

export type SignAwsV4Input = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  region: string;
  service: string;
  credentials: AwsCredentials;
  /** UTC ISO-8601 basic, e.g. 20150830T123600Z. Defaults to now. */
  amzDate?: string;
};

export type SignedAwsRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
};

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function amzDateNow(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalUri(pathname: string): string {
  if (!pathname) return "/";
  return pathname
    .split("/")
    .map((seg) => encodeRfc3986(decodeURIComponent(seg)))
    .join("/")
    .replace(/\/+/g, "/");
}

function canonicalQuery(search: string): string {
  if (!search) return "";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const pairs: string[] = [];
  const keys = [...new Set([...params.keys()])].sort();
  for (const key of keys) {
    const values = params.getAll(key).sort();
    for (const value of values) {
      pairs.push(`${encodeRfc3986(key)}=${encodeRfc3986(value)}`);
    }
  }
  return pairs.join("&");
}

export function signAwsV4(input: SignAwsV4Input): SignedAwsRequest {
  const url = new URL(input.url);
  const method = input.method.toUpperCase();
  const amzDate = input.amzDate ?? amzDateNow();
  const dateStamp = amzDate.slice(0, 8);
  const body = input.body ?? "";
  const payloadHash = sha256Hex(body);

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    headers[k.toLowerCase()] = v.trim();
  }
  headers.host = url.host;
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = payloadHash;
  if (input.credentials.sessionToken) {
    headers["x-amz-security-token"] = input.credentials.sessionToken;
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    canonicalUri(url.pathname) || "/",
    canonicalQuery(url.search),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${input.credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const outHeaders: Record<string, string> = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, v])),
    authorization,
  };

  return {
    url: input.url,
    method,
    headers: outHeaders,
    body: input.body,
    canonicalRequest,
    stringToSign,
    signature,
  };
}

export function emptyPayloadHash(): string {
  return sha256Hex("");
}
