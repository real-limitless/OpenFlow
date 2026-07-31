import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import type { CredentialData } from "@/lib/engine/credentials";
import { evaluateExpression } from "../../expressions/evaluate";

export interface S3BucketInfo {
  name: string;
  creationDate?: string;
}

export interface S3ObjectInfo {
  key: string;
  lastModified?: string;
  size?: number;
  eTag?: string;
  storageClass?: string;
  owner?: { id?: string; displayName?: string };
}

export interface S3FolderInfo {
  key: string;
  owner?: { id?: string; displayName?: string };
}

export interface S3DownloadResult {
  body: Buffer;
  contentType?: string;
  contentLength?: number;
  eTag?: string;
  lastModified?: string;
  metadata?: Record<string, string>;
}

export interface S3ListObjectsResult {
  objects: S3ObjectInfo[];
  folders?: S3FolderInfo[];
  isTruncated?: boolean;
  nextContinuationToken?: string;
}

export interface S3Client {
  createBucket(
    name: string,
    options?: {
      acl?: string;
      region?: string;
      objectLockEnabled?: boolean;
      grantFullControl?: boolean;
      grantRead?: boolean;
      grantReadAcp?: boolean;
      grantWrite?: boolean;
      grantWriteAcp?: boolean;
    },
  ): Promise<void>;
  deleteBucket(name: string): Promise<void>;
  listBuckets(): Promise<S3BucketInfo[]>;
  listObjects(
    bucket: string,
    options?: {
      prefix?: string;
      delimiter?: string;
      maxKeys?: number;
      startAfter?: string;
      encodingType?: string;
      fetchOwner?: boolean;
      requesterPays?: boolean;
      continuationToken?: string;
    },
  ): Promise<S3ListObjectsResult>;
  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    options?: {
      acl?: string;
      contentType?: string;
      storageClass?: string;
      tags?: Record<string, string>;
      parentFolderKey?: string;
      requesterPays?: boolean;
      metadata?: Record<string, string>;
      [key: string]: unknown;
    },
  ): Promise<void>;
  getObject(bucket: string, key: string): Promise<S3DownloadResult>;
  deleteObject(bucket: string, key: string, versionId?: string): Promise<void>;
  copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  close(): Promise<void>;
}

export type S3ClientFactory = (
  credentials: CredentialData,
) => Promise<S3Client>;

let clientFactory: S3ClientFactory | null = null;

export function setS3ClientFactory(factory: S3ClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: S3ClientFactory = async () => {
  throw new Error(
    "S3: no transport client configured. Wire a real S3 client via setS3ClientFactory.",
  );
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function str(raw: unknown, itemJson: Record<string, unknown>, fallback = ""): string {
  const v = resolveValue(raw, itemJson);
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** Parse `/bucket/key` paths into bucket + key. */
export function parseS3Path(path: string): { bucket: string; key: string } {
  const trimmed = path.trim();
  const withoutLeading = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const slash = withoutLeading.indexOf("/");
  if (slash === -1) {
    if (!withoutLeading) {
      throw new Error("S3: path must be of the form /bucket/key");
    }
    return { bucket: withoutLeading, key: "" };
  }
  const bucket = withoutLeading.slice(0, slash);
  const key = withoutLeading.slice(slash + 1);
  if (!bucket) {
    throw new Error(`S3: invalid path "${path}" — missing bucket`);
  }
  return { bucket, key };
}

function requireParam(name: string, value: string): string {
  if (!value) {
    throw new Error(`S3: required parameter "${name}" is missing`);
  }
  return value;
}

function buildFolderKey(folderName: string, parentFolderKey?: string): string {
  const name = folderName.replace(/^\/+|\/+$/g, "");
  const parent = (parentFolderKey ?? "").replace(/^\/+|\/+$/g, "");
  const joined = parent ? `${parent}/${name}` : name;
  return joined.endsWith("/") ? joined : `${joined}/`;
}

function clampLimit(limit: unknown, fallback = 100): number {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 500);
}

function tagsFromUi(tagsUi: unknown): Record<string, string> | undefined {
  const root = asRecord(tagsUi);
  const values = root.tagsValues;
  if (!Array.isArray(values)) return undefined;
  const out: Record<string, string> = {};
  for (const entry of values) {
    const e = asRecord(entry);
    const k = e.key != null ? String(e.key) : "";
    if (!k) continue;
    out[k] = e.value != null ? String(e.value) : "";
  }
  return Object.keys(out).length ? out : undefined;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const s3Executor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = ctx.getParam<string>("resource", "file");
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("s3");
  if (!credentials) {
    throw new Error('S3: credential "s3" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials);

  try {
    switch (resource) {
      case "bucket":
        return [await runBucket(ctx, items, client, continueOnFail)];
      case "file":
        return [await runFile(ctx, items, client, continueOnFail)];
      case "folder":
        return [await runFolder(ctx, items, client, continueOnFail)];
      default:
        throw new Error(`S3: unknown resource "${resource}"`);
    }
  } finally {
    await client.close().catch(() => {});
  }
};

async function runBucket(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: S3Client,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const operation = ctx.getParam<string>("operation", "create");
  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const json = items[i].json ?? {};
    try {
      switch (operation) {
        case "create": {
          const name = requireParam("name", str(ctx.getParam("name", ""), json));
          const additional = asRecord(ctx.getParam("additionalFields", {}));
          await client.createBucket(name, {
            acl: additional.acl != null ? String(additional.acl) : undefined,
            region: additional.region != null ? String(additional.region) : undefined,
            objectLockEnabled: additional.bucketObjectLockEnabled === true,
            grantFullControl: additional.grantFullControl === true,
            grantRead: additional.grantRead === true,
            grantReadAcp: additional.grantReadAcp === true,
            grantWrite: additional.grantWrite === true,
            grantWriteAcp: additional.grantWriteAcp === true,
          });
          out.push({ json: { success: true }, pairedItem: { item: i, input: 0 } });
          break;
        }
        case "delete": {
          const name = requireParam("name", str(ctx.getParam("name", ""), json));
          await client.deleteBucket(name);
          out.push({ json: { success: true }, pairedItem: { item: i, input: 0 } });
          break;
        }
        case "getAll": {
          const returnAll = ctx.getParam<boolean>("returnAll", false);
          const limit = clampLimit(ctx.getParam("limit", 100));
          let buckets = await client.listBuckets();
          if (!returnAll) buckets = buckets.slice(0, limit);
          for (const b of buckets) {
            out.push({
              json: {
                name: b.name,
                ...(b.creationDate ? { creationDate: b.creationDate } : {}),
              },
              pairedItem: { item: i, input: 0 },
            });
          }
          break;
        }
        case "search": {
          const bucketName = requireParam(
            "bucketName",
            str(ctx.getParam("bucketName", ""), json),
          );
          const returnAll = ctx.getParam<boolean>("returnAll", false);
          const limit = clampLimit(ctx.getParam("limit", 100));
          const additional = asRecord(ctx.getParam("additionalFields", {}));
          const objects = await listAllObjects(client, bucketName, {
            prefix: additional.prefix != null ? String(additional.prefix) : undefined,
            delimiter: additional.delimiter != null ? String(additional.delimiter) : undefined,
            startAfter:
              additional.startAfter != null ? String(additional.startAfter) : undefined,
            encodingType:
              additional.encodingType != null ? String(additional.encodingType) : undefined,
            fetchOwner: additional.fetchOwner === true,
            requesterPays: additional.requesterPays === true,
            returnAll,
            limit,
          });
          for (const o of objects) {
            out.push({
              json: { ...o },
              pairedItem: { item: i, input: 0 },
            });
          }
          break;
        }
        default:
          throw new Error(`S3: unknown bucket operation "${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err instanceof Error ? err : new Error(errMessage(err));
      out.push({ json: { error: errMessage(err) }, pairedItem: { item: i, input: 0 } });
    }
  }

  return out;
}

async function runFile(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: S3Client,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const operation = ctx.getParam<string>("operation", "download");
  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = item.json ?? {};
    try {
      switch (operation) {
        case "upload": {
          const bucketName = requireParam(
            "bucketName",
            str(ctx.getParam("bucketName", ""), json),
          );
          const binaryData = ctx.getParam<boolean>("binaryData", true);
          const additional = asRecord(ctx.getParam("additionalFields", {}));
          let body: Buffer;
          let fileName = str(ctx.getParam("fileName", ""), json);
          let contentType: string | undefined;

          if (binaryData) {
            const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
            const bin = item.binary?.[binaryPropertyName];
            if (!bin) {
              throw new Error(
                `S3: upload binary property "${binaryPropertyName}" not found on item ${i}`,
              );
            }
            body = Buffer.from(bin.data, "base64");
            if (!fileName) fileName = bin.fileName ?? "upload";
            contentType = bin.mimeType;
          } else {
            requireParam("fileName", fileName);
            const content = str(ctx.getParam("fileContent", ""), json);
            body = Buffer.from(content, "utf8");
          }

          const parent = additional.parentFolderKey
            ? String(additional.parentFolderKey).replace(/^\/+|\/+$/g, "")
            : "";
          const key = parent ? `${parent}/${fileName}` : fileName;
          const tags = tagsFromUi(ctx.getParam("tagsUi", {}));

          await client.putObject(bucketName, key, body, {
            ...additional,
            acl: additional.acl != null ? String(additional.acl) : undefined,
            storageClass:
              additional.storageClass != null ? String(additional.storageClass) : undefined,
            contentType,
            tags,
            requesterPays: additional.requesterPays === true,
          });
          out.push({
            json: { success: true },
            pairedItem: { item: i, input: 0 },
          });
          break;
        }
        case "download": {
          const bucketName = requireParam(
            "bucketName",
            str(ctx.getParam("bucketName", ""), json),
          );
          const fileKey = requireParam("fileKey", str(ctx.getParam("fileKey", ""), json));
          const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
          const result = await client.getObject(bucketName, fileKey);
          const fileName = fileKey.split("/").pop() ?? fileKey;
          const mimeType = result.contentType ?? "application/octet-stream";
          out.push({
            json: { ...json },
            binary: {
              ...item.binary,
              [binaryPropertyName]: {
                data: result.body.toString("base64"),
                mimeType,
                fileName,
                fileExtension: fileName.includes(".") ? fileName.split(".").pop()! : "",
                fileSize: result.body.length,
              },
            },
            pairedItem: { item: i, input: 0 },
          });
          break;
        }
        case "delete": {
          const bucketName = requireParam(
            "bucketName",
            str(ctx.getParam("bucketName", ""), json),
          );
          const fileKey = requireParam("fileKey", str(ctx.getParam("fileKey", ""), json));
          const options = asRecord(ctx.getParam("options", {}));
          const versionId =
            options.versionId != null ? String(options.versionId) : undefined;
          await client.deleteObject(bucketName, fileKey, versionId);
          out.push({ json: { success: true }, pairedItem: { item: i, input: 0 } });
          break;
        }
        case "copy": {
          const sourcePath = requireParam(
            "sourcePath",
            str(ctx.getParam("sourcePath", ""), json),
          );
          const destinationPath = requireParam(
            "destinationPath",
            str(ctx.getParam("destinationPath", ""), json),
          );
          const src = parseS3Path(sourcePath);
          const dest = parseS3Path(destinationPath);
          if (!src.key) throw new Error("S3: sourcePath must include an object key");
          if (!dest.key) throw new Error("S3: destinationPath must include an object key");
          const additional = asRecord(ctx.getParam("additionalFields", {}));
          await client.copyObject(src.bucket, src.key, dest.bucket, dest.key, additional);
          out.push({ json: { success: true }, pairedItem: { item: i, input: 0 } });
          break;
        }
        case "getAll": {
          const bucketName = requireParam(
            "bucketName",
            str(ctx.getParam("bucketName", ""), json),
          );
          const returnAll = ctx.getParam<boolean>("returnAll", false);
          const limit = clampLimit(ctx.getParam("limit", 100));
          const options = asRecord(ctx.getParam("options", {}));
          const folderKey =
            options.folderKey != null ? String(options.folderKey) : undefined;
          const objects = await listAllObjects(client, bucketName, {
            prefix: folderKey,
            fetchOwner: options.fetchOwner === true,
            returnAll,
            limit,
          });
          for (const o of objects) {
            out.push({
              json: {
                key: o.key,
                ...(o.lastModified ? { lastModified: o.lastModified } : {}),
                ...(o.size !== undefined ? { size: o.size } : {}),
                ...(o.eTag ? { eTag: o.eTag } : {}),
                ...(o.storageClass ? { storageClass: o.storageClass } : {}),
                ...(o.owner ? { owner: o.owner } : {}),
              },
              pairedItem: { item: i, input: 0 },
            });
          }
          break;
        }
        default:
          throw new Error(`S3: unknown file operation "${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err instanceof Error ? err : new Error(errMessage(err));
      out.push({ json: { error: errMessage(err) }, pairedItem: { item: i, input: 0 } });
    }
  }

  return out;
}

async function runFolder(
  ctx: Parameters<NodeExecutor>[0],
  items: INodeExecutionData[],
  client: S3Client,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const operation = ctx.getParam<string>("operation", "create");
  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const json = items[i].json ?? {};
    try {
      switch (operation) {
        case "create": {
          const bucketName = requireParam(
            "bucketName",
            str(ctx.getParam("bucketName", ""), json),
          );
          const folderName = requireParam(
            "folderName",
            str(ctx.getParam("folderName", ""), json),
          );
          const additional = asRecord(ctx.getParam("additionalFields", {}));
          const parent =
            additional.parentFolderKey != null
              ? String(additional.parentFolderKey)
              : undefined;
          const key = buildFolderKey(folderName, parent);
          await client.putObject(bucketName, key, Buffer.alloc(0), {
            storageClass:
              additional.storageClass != null
                ? String(additional.storageClass)
                : "standard",
            requesterPays: additional.requesterPays === true,
          });
          out.push({ json: { success: true }, pairedItem: { item: i, input: 0 } });
          break;
        }
        case "delete": {
          const bucketName = requireParam(
            "bucketName",
            str(ctx.getParam("bucketName", ""), json),
          );
          const folderKey = requireParam(
            "folderKey",
            str(ctx.getParam("folderKey", ""), json),
          );
          const normalized = folderKey.endsWith("/") ? folderKey : `${folderKey}/`;
          // Delete all objects under the folder prefix, then the folder marker if present.
          const objects = await listAllObjects(client, bucketName, {
            prefix: normalized,
            returnAll: true,
            limit: 500,
          });
          for (const o of objects) {
            await client.deleteObject(bucketName, o.key);
          }
          // Also try deleting the exact key if it was a zero-byte marker without trailing slash listed.
          if (folderKey !== normalized) {
            await client.deleteObject(bucketName, folderKey).catch(() => {});
          }
          out.push({ json: { success: true }, pairedItem: { item: i, input: 0 } });
          break;
        }
        case "getAll": {
          const bucketName = requireParam(
            "bucketName",
            str(ctx.getParam("bucketName", ""), json),
          );
          const returnAll = ctx.getParam<boolean>("returnAll", false);
          const limit = clampLimit(ctx.getParam("limit", 100));
          const options = asRecord(ctx.getParam("options", {}));
          const prefix =
            options.folderKey != null ? String(options.folderKey) : undefined;
          const result = await client.listObjects(bucketName, {
            prefix,
            delimiter: "/",
            fetchOwner: options.fetchOwner === true,
            maxKeys: returnAll ? undefined : limit,
          });
          let folders = result.folders ?? [];
          if (!returnAll) folders = folders.slice(0, limit);
          for (const f of folders) {
            out.push({
              json: {
                key: f.key,
                ...(f.owner ? { owner: f.owner } : {}),
              },
              pairedItem: { item: i, input: 0 },
            });
          }
          break;
        }
        default:
          throw new Error(`S3: unknown folder operation "${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err instanceof Error ? err : new Error(errMessage(err));
      out.push({ json: { error: errMessage(err) }, pairedItem: { item: i, input: 0 } });
    }
  }

  return out;
}

async function listAllObjects(
  client: S3Client,
  bucket: string,
  opts: {
    prefix?: string;
    delimiter?: string;
    startAfter?: string;
    encodingType?: string;
    fetchOwner?: boolean;
    requesterPays?: boolean;
    returnAll: boolean;
    limit: number;
  },
): Promise<S3ObjectInfo[]> {
  const collected: S3ObjectInfo[] = [];
  let token: string | undefined;
  do {
    const page = await client.listObjects(bucket, {
      prefix: opts.prefix,
      delimiter: opts.delimiter,
      startAfter: opts.startAfter,
      encodingType: opts.encodingType,
      fetchOwner: opts.fetchOwner,
      requesterPays: opts.requesterPays,
      maxKeys: opts.returnAll ? 1000 : opts.limit - collected.length,
      continuationToken: token,
    });
    collected.push(...page.objects);
    if (!opts.returnAll && collected.length >= opts.limit) {
      return collected.slice(0, opts.limit);
    }
    token = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (token);
  return collected;
}
