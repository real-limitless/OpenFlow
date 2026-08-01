import type { CredentialData } from "@/lib/engine/credentials";
import { createSignedS3Request, type SignedS3Request } from "../s3-sigv4";
import type {
  S3BucketInfo,
  S3Client,
  S3ClientFactory,
  S3DownloadResult,
  S3ListObjectsResult,
  S3ObjectInfo,
} from "./s3";

/**
 * Default S3 client for the `n8n-nodes-base.s3` executor.
 *
 * Talks to the REST API directly over the shared SigV4 signer rather than an
 * AWS SDK, so the node works against AWS S3 and any S3-compatible server
 * (MinIO, Wasabi, DigitalOcean Spaces) with no extra dependency. Responses are
 * XML; the shapes consumed here are shallow and fixed, so a small tag reader
 * beats pulling in a parser.
 */

// --- tiny XML helpers -------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Inner text of the first `<tag>` in `xml`, or undefined. */
function tagText(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? decodeEntities(m[1]) : undefined;
}

/** Inner content of every `<tag>` block in `xml`. */
function tagBlocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- credential mapping -----------------------------------------------------

function cred(credentials: CredentialData, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = (credentials as Record<string, unknown>)[n];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function truthy(credentials: CredentialData, ...names: string[]): boolean | undefined {
  for (const n of names) {
    const v = (credentials as Record<string, unknown>)[n];
    if (v === undefined || v === null || v === "") continue;
    return v === true || v === "true" || v === 1 || v === "1";
  }
  return undefined;
}

// --- response handling ------------------------------------------------------

async function assertOk(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  const code = tagText(body, "Code");
  const message = tagText(body, "Message");
  const detail = code || message ? `${code ?? "Error"}: ${message ?? ""}`.trim() : body.slice(0, 300);
  throw new Error(`S3: ${what} failed (HTTP ${res.status})${detail ? ` — ${detail}` : ""}`);
}

function parseOwner(block: string): { id?: string; displayName?: string } | undefined {
  const owner = tagBlocks(block, "Owner")[0];
  if (!owner) return undefined;
  const id = tagText(owner, "ID");
  const displayName = tagText(owner, "DisplayName");
  if (id === undefined && displayName === undefined) return undefined;
  return { ...(id !== undefined ? { id } : {}), ...(displayName !== undefined ? { displayName } : {}) };
}

// --- client -----------------------------------------------------------------

function createClient(sign: SignedS3Request): S3Client {
  return {
    async createBucket(name, options) {
      const headers: Record<string, string> = {};
      if (options?.acl) headers["x-amz-acl"] = kebabAcl(options.acl);
      if (options?.objectLockEnabled) headers["x-amz-bucket-object-lock-enabled"] = "true";
      // The node models grants as toggles rather than grantee strings, so the
      // header is emitted with an empty value when enabled.
      if (options?.grantFullControl) headers["x-amz-grant-full-control"] = "";
      if (options?.grantRead) headers["x-amz-grant-read"] = "";
      if (options?.grantReadAcp) headers["x-amz-grant-read-acp"] = "";
      if (options?.grantWrite) headers["x-amz-grant-write"] = "";
      if (options?.grantWriteAcp) headers["x-amz-grant-write-acp"] = "";

      // us-east-1 must NOT send a location constraint; every other region must.
      let body: Buffer | undefined;
      if (options?.region && options.region !== "us-east-1") {
        body = Buffer.from(
          `<?xml version="1.0" encoding="UTF-8"?><CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LocationConstraint>${xmlEscape(options.region)}</LocationConstraint></CreateBucketConfiguration>`,
          "utf8",
        );
        headers["content-type"] = "application/xml";
      }

      const res = await sign({ method: "PUT", bucket: name, key: "", body, headers });
      await assertOk(res, `create bucket "${name}"`);
    },

    async deleteBucket(name) {
      const res = await sign({ method: "DELETE", bucket: name, key: "" });
      await assertOk(res, `delete bucket "${name}"`);
    },

    async listBuckets(): Promise<S3BucketInfo[]> {
      const res = await sign({ method: "GET" });
      await assertOk(res, "list buckets");
      const xml = await res.text();
      return tagBlocks(xml, "Bucket").map((b) => {
        const creationDate = tagText(b, "CreationDate");
        return {
          name: tagText(b, "Name") ?? "",
          ...(creationDate ? { creationDate } : {}),
        };
      });
    },

    async listObjects(bucket, options): Promise<S3ListObjectsResult> {
      const res = await sign({
        method: "GET",
        bucket,
        key: "",
        query: {
          "list-type": 2,
          prefix: options?.prefix,
          delimiter: options?.delimiter,
          "max-keys": options?.maxKeys,
          "start-after": options?.startAfter,
          "encoding-type": options?.encodingType,
          "fetch-owner": options?.fetchOwner ? "true" : undefined,
          "continuation-token": options?.continuationToken,
        },
        headers: options?.requesterPays ? { "x-amz-request-payer": "requester" } : undefined,
      });
      await assertOk(res, `list objects in "${bucket}"`);
      const xml = await res.text();

      const objects: S3ObjectInfo[] = tagBlocks(xml, "Contents").map((c) => {
        const lastModified = tagText(c, "LastModified");
        const sizeRaw = tagText(c, "Size");
        const eTag = tagText(c, "ETag");
        const storageClass = tagText(c, "StorageClass");
        const owner = parseOwner(c);
        return {
          key: tagText(c, "Key") ?? "",
          ...(lastModified ? { lastModified } : {}),
          ...(sizeRaw !== undefined ? { size: Number(sizeRaw) } : {}),
          ...(eTag ? { eTag: eTag.replace(/^"|"$/g, "") } : {}),
          ...(storageClass ? { storageClass } : {}),
          ...(owner ? { owner } : {}),
        };
      });

      const folders = tagBlocks(xml, "CommonPrefixes").map((p) => ({
        key: tagText(p, "Prefix") ?? "",
      }));

      const nextContinuationToken = tagText(xml, "NextContinuationToken");
      return {
        objects,
        ...(folders.length ? { folders } : { folders: [] }),
        isTruncated: tagText(xml, "IsTruncated") === "true",
        ...(nextContinuationToken ? { nextContinuationToken } : {}),
      };
    },

    async putObject(bucket, key, body, options) {
      const headers: Record<string, string> = {
        "content-type": options?.contentType ?? "application/octet-stream",
      };
      if (options?.acl) headers["x-amz-acl"] = kebabAcl(String(options.acl));
      if (options?.storageClass) {
        headers["x-amz-storage-class"] = String(options.storageClass).toUpperCase();
      }
      if (options?.requesterPays) headers["x-amz-request-payer"] = "requester";
      if (options?.tags && Object.keys(options.tags).length > 0) {
        headers["x-amz-tagging"] = new URLSearchParams(options.tags).toString();
      }
      for (const [k, v] of Object.entries(options?.metadata ?? {})) {
        headers[`x-amz-meta-${k.toLowerCase()}`] = String(v);
      }

      const res = await sign({ method: "PUT", bucket, key, body, headers });
      await assertOk(res, `upload "${key}"`);
    },

    async getObject(bucket, key): Promise<S3DownloadResult> {
      const res = await sign({ method: "GET", bucket, key });
      await assertOk(res, `download "${key}"`);

      const metadata: Record<string, string> = {};
      res.headers.forEach((value, name) => {
        if (name.toLowerCase().startsWith("x-amz-meta-")) {
          metadata[name.toLowerCase().slice("x-amz-meta-".length)] = value;
        }
      });

      const contentType = res.headers.get("content-type") ?? undefined;
      const contentLengthRaw = res.headers.get("content-length");
      const eTag = res.headers.get("etag") ?? undefined;
      const lastModified = res.headers.get("last-modified") ?? undefined;

      return {
        body: Buffer.from(await res.arrayBuffer()),
        ...(contentType ? { contentType } : {}),
        ...(contentLengthRaw != null ? { contentLength: Number(contentLengthRaw) } : {}),
        ...(eTag ? { eTag: eTag.replace(/^"|"$/g, "") } : {}),
        ...(lastModified ? { lastModified } : {}),
        ...(Object.keys(metadata).length ? { metadata } : {}),
      };
    },

    async deleteObject(bucket, key, versionId) {
      const res = await sign({
        method: "DELETE",
        bucket,
        key,
        query: { versionId },
      });
      await assertOk(res, `delete "${key}"`);
    },

    async copyObject(sourceBucket, sourceKey, destBucket, destKey, options) {
      const headers: Record<string, string> = {
        // Must be the *encoded* source path, and always includes the bucket.
        "x-amz-copy-source": `/${sourceBucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
      };
      const opts = (options ?? {}) as Record<string, unknown>;
      if (opts.acl) headers["x-amz-acl"] = kebabAcl(String(opts.acl));
      if (opts.storageClass) headers["x-amz-storage-class"] = String(opts.storageClass).toUpperCase();
      if (opts.requesterPays === true) headers["x-amz-request-payer"] = "requester";
      if (opts.metadataDirective) {
        headers["x-amz-metadata-directive"] = String(opts.metadataDirective).toUpperCase();
      }
      if (opts.taggingDirective) {
        headers["x-amz-tagging-directive"] = String(opts.taggingDirective).toUpperCase();
      }

      const res = await sign({ method: "PUT", bucket: destBucket, key: destKey, headers });
      await assertOk(res, `copy "${sourceKey}" to "${destKey}"`);
      // S3 can return 200 with an <Error> body on copy; surface that too.
      const xml = await res.text().catch(() => "");
      if (xml.includes("<Error")) {
        throw new Error(
          `S3: copy "${sourceKey}" to "${destKey}" failed — ${tagText(xml, "Code") ?? "Error"}: ${tagText(xml, "Message") ?? ""}`.trim(),
        );
      }
    },

    async close() {
      /* stateless over fetch */
    },
  };
}

/** `publicRead` / `PublicRead` -> `public-read`; already-kebab values pass through. */
function kebabAcl(acl: string): string {
  if (acl.includes("-")) return acl.toLowerCase();
  return acl
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

export const defaultS3ClientFactory: S3ClientFactory = async (credentials) => {
  const accessKeyId = cred(credentials, "accessKeyId", "accessKey", "access_key_id");
  const secretAccessKey = cred(credentials, "secretAccessKey", "secretKey", "secret_access_key");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3: credential is missing accessKeyId / secretAccessKey. Fill both in the s3 credential.",
    );
  }

  const endpoint = cred(credentials, "endpoint", "s3Endpoint", "url");
  const forcePathStyle = truthy(credentials, "forcePathStyle", "force_path_style");

  return createClient(
    createSignedS3Request({
      region: cred(credentials, "region"),
      endpoint,
      accessKeyId,
      secretAccessKey,
      sessionToken: cred(credentials, "sessionToken", "securityToken"),
      // Custom endpoints default to path style; AWS defaults to virtual-host
      // unless the credential opts in.
      forcePathStyle: forcePathStyle ?? (endpoint ? true : false),
    }),
  );
};
