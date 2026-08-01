import type { BinaryStore } from "./binary-store";
import type { BinaryRef } from "./binary-types";
import { createSignedS3Request } from "./s3-sigv4";

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

/**
 * S3-compatible binary store (AWS S3, MinIO, etc.) using SigV4 + fetch.
 * Metadata is stored as object user-metadata (x-amz-meta-*).
 */
export function createS3BinaryStore(cfg: S3BinaryStoreConfig): BinaryStore {
  const region = cfg.region || "us-east-1";
  const prefix = (cfg.prefix ?? "openflow/binary/").replace(/^\//, "");
  const fetchImpl = cfg.fetchImpl ?? fetch;

  function objectKey(id: string): string {
    return `${prefix}${id}`;
  }

  const sign = createSignedS3Request({
    region,
    endpoint: cfg.endpoint,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    forcePathStyle: cfg.forcePathStyle,
    fetchImpl,
  });

  async function signedRequest(
    method: string,
    key: string,
    body?: Buffer,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    return sign({ method, bucket: cfg.bucket, key, body, headers: extraHeaders });
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
