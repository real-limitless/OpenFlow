import { createHash, createHmac } from "crypto";
import type { BinaryStore } from "./binary-store";
import type { BinaryRef } from "./binary-types";

export type S3BinaryStoreConfig = {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Prefix for object keys (default openflow/binary/) */
  prefix?: string;
  forcePathStyle?: boolean;
  fetchImpl?: typeof fetch;
};

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hashHex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * S3-compatible binary store (AWS S3, MinIO, etc.) using SigV4 + fetch.
 * Metadata is stored as object user-metadata (x-amz-meta-*).
 */
export function createS3BinaryStore(cfg: S3BinaryStoreConfig): BinaryStore {
  const region = cfg.region || "us-east-1";
  const prefix = (cfg.prefix ?? "openflow/binary/").replace(/^\//, "");
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const forcePathStyle = cfg.forcePathStyle !== false || Boolean(cfg.endpoint);

  function objectKey(id: string): string {
    return `${prefix}${id}`;
  }

  function hostAndPath(key: string): { host: string; path: string; url: string } {
    if (cfg.endpoint) {
      const base = cfg.endpoint.replace(/\/$/, "");
      const u = new URL(base);
      const host = u.host;
      const path = forcePathStyle
        ? `${u.pathname.replace(/\/$/, "")}/${cfg.bucket}/${key}`.replace(/\/+/g, "/")
        : `${u.pathname.replace(/\/$/, "")}/${key}`;
      const url = forcePathStyle
        ? `${base}/${cfg.bucket}/${key}`
        : `${u.protocol}//${cfg.bucket}.${host}${u.pathname === "/" ? "" : u.pathname}/${key}`;
      return { host: forcePathStyle ? host : `${cfg.bucket}.${host}`, path: path.startsWith("/") ? path : `/${path}`, url };
    }
    const host = forcePathStyle
      ? `s3.${region}.amazonaws.com`
      : `${cfg.bucket}.s3.${region}.amazonaws.com`;
    const path = forcePathStyle ? `/${cfg.bucket}/${key}` : `/${key}`;
    const url = `https://${host}${path}`;
    return { host, path, url };
  }

  async function signedRequest(
    method: string,
    key: string,
    body?: Buffer,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const { host, path, url } = hostAndPath(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = hashHex(body ?? "");

    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(cfg.sessionToken ? { "x-amz-security-token": cfg.sessionToken } : {}),
      ...extraHeaders,
    };
    if (body) {
      headers["content-length"] = String(body.length);
      headers["content-type"] = extraHeaders?.["content-type"] ?? "application/octet-stream";
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
      method,
      path
        .split("/")
        .map((p) => encodeRfc3986(decodeURIComponent(p)))
        .join("/")
        .replace(/\/+/g, "/"),
      "",
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

    return fetchImpl(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
  }

  function metaToHeaders(meta: BinaryRef): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": meta.mimeType || "application/octet-stream",
      "x-amz-meta-mime-type": meta.mimeType || "application/octet-stream",
      "x-amz-meta-file-size": String(meta.fileSize),
    };
    if (meta.fileName) h["x-amz-meta-file-name"] = meta.fileName;
    if (meta.fileExtension) h["x-amz-meta-file-extension"] = meta.fileExtension;
    return h;
  }

  function headersToMeta(id: string, headers: Headers): BinaryRef {
    const get = (k: string) => headers.get(k) ?? headers.get(k.toLowerCase());
    return {
      id,
      mimeType: get("x-amz-meta-mime-type") || get("content-type") || "application/octet-stream",
      fileName: get("x-amz-meta-file-name") || undefined,
      fileExtension: get("x-amz-meta-file-extension") || undefined,
      fileSize: parseInt(get("x-amz-meta-file-size") || "0", 10) || 0,
    };
  }

  return {
    async put(id, buffer, meta) {
      const res = await signedRequest("PUT", objectKey(id), buffer, metaToHeaders(meta));
      if (!res.ok) {
        throw new Error(`S3 put failed: ${res.status} ${await res.text()}`);
      }
    },
    async get(id) {
      const res = await signedRequest("GET", objectKey(id));
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`S3 get failed: ${res.status} ${await res.text()}`);
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    },
    async getMeta(id) {
      const res = await signedRequest("HEAD", objectKey(id));
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`S3 head failed: ${res.status}`);
      }
      const meta = headersToMeta(id, res.headers);
      if (!meta.fileSize) {
        const cl = res.headers.get("content-length");
        if (cl) meta.fileSize = parseInt(cl, 10) || 0;
      }
      return meta;
    },
    async delete(id) {
      const res = await signedRequest("DELETE", objectKey(id));
      if (!res.ok && res.status !== 404) {
        throw new Error(`S3 delete failed: ${res.status}`);
      }
    },
  };
}
