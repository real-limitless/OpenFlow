import { createHash, createHmac } from "crypto";

/**
 * AWS SigV4 request signing for S3-compatible endpoints (AWS S3, MinIO, ...).
 *
 * Extracted from binary-s3.ts so the S3 *node executor* can reuse it instead of
 * pulling in an AWS SDK. Generalised over what the binary store needed in two
 * ways: the bucket is per-request (the executor targets whatever bucket the
 * workflow names) and query parameters are signed (ListObjectsV2 and friends
 * are query-driven; the binary store only ever signed bare object paths).
 */

export type S3SigV4Config = {
  region?: string;
  /** Custom endpoint for S3-compatible servers. Implies path-style addressing. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle?: boolean;
  fetchImpl?: typeof fetch;
};

export type SignedS3RequestInit = {
  method: string;
  /** Omit for service-level operations such as ListBuckets. */
  bucket?: string;
  /** Object key, unencoded. Omit for bucket-level operations. */
  key?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Buffer;
  headers?: Record<string, string>;
};

export type SignedS3Request = (init: SignedS3RequestInit) => Promise<Response>;

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hashHex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Canonical query string: RFC3986-encoded, sorted by key. Undefined values are
 * dropped so callers can pass optional params inline.
 */
function canonicalQuery(query: Record<string, string | number | boolean | undefined>): string {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    pairs.push([encodeRfc3986(k), encodeRfc3986(String(v))]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

export function createSignedS3Request(cfg: S3SigV4Config): SignedS3Request {
  const region = cfg.region || "us-east-1";
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const forcePathStyle = cfg.forcePathStyle !== false || Boolean(cfg.endpoint);

  function hostAndPath(
    bucket: string | undefined,
    key: string,
  ): { host: string; path: string; url: string } {
    if (cfg.endpoint) {
      const base = cfg.endpoint.replace(/\/$/, "");
      const u = new URL(base);
      const host = u.host;
      const basePath = u.pathname.replace(/\/$/, "");
      if (!bucket) {
        return { host, path: `${basePath}/` || "/", url: `${base}/` };
      }
      const path = forcePathStyle
        ? `${basePath}/${bucket}/${key}`.replace(/\/+/g, "/")
        : `${basePath}/${key}`;
      const url = forcePathStyle
        ? `${base}/${bucket}/${key}`
        : `${u.protocol}//${bucket}.${host}${u.pathname === "/" ? "" : u.pathname}/${key}`;
      return {
        host: forcePathStyle ? host : `${bucket}.${host}`,
        path: path.startsWith("/") ? path : `/${path}`,
        url,
      };
    }

    if (!bucket) {
      const host = `s3.${region}.amazonaws.com`;
      return { host, path: "/", url: `https://${host}/` };
    }
    const host = forcePathStyle ? `s3.${region}.amazonaws.com` : `${bucket}.s3.${region}.amazonaws.com`;
    const path = forcePathStyle ? `/${bucket}/${key}` : `/${key}`;
    return { host, path, url: `https://${host}${path}` };
  }

  return async function signedRequest(init: SignedS3RequestInit): Promise<Response> {
    const { host, path, url } = hostAndPath(init.bucket, init.key ?? "");
    const query = canonicalQuery(init.query ?? {});
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const body = init.body;
    const payloadHash = hashHex(body ?? "");

    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(cfg.sessionToken ? { "x-amz-security-token": cfg.sessionToken } : {}),
      ...init.headers,
    };
    if (body) {
      headers["content-length"] = String(body.length);
      headers["content-type"] = init.headers?.["content-type"] ?? "application/octet-stream";
    }

    const signedHeaderKeys = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderKeys
      .map((k) => {
        const v = headers[k] ?? headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!];
        return `${k}:${String(v).trim()}\n`;
      })
      .join("");
    const signedHeaders = signedHeaderKeys.join(";");

    const canonicalRequest = [
      init.method,
      path
        .split("/")
        .map((p) => encodeRfc3986(decodeURIComponent(p)))
        .join("/")
        .replace(/\/+/g, "/"),
      query,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      hashHex(canonicalRequest),
    ].join("\n");

    const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetchImpl(query ? `${url}?${query}` : url, {
      method: init.method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
  };
}
