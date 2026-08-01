import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function getParam(params: Record<string, unknown>, name: string, itemJson: Record<string, unknown>, defaultVal: unknown = ""): unknown {
  const raw = params[name];
  if (raw === undefined) return defaultVal;
  return resolveValue(raw, itemJson);
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
}

type OpResultList = OpResult | OpResult[];

async function getAwsCreds(ctx: ExecutionContext): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}> {
  const cred = await ctx.getCredential("aws");
  if (!cred) throw new Error('AWS S3: credential "aws" is not configured');
  const region = String(cred.region ?? "us-east-1");
  const accessKeyId = String(cred.accessKeyId ?? "");
  const secretAccessKey = String(cred.secretAccessKey ?? "");
  const sessionToken = cred.sessionToken ? String(cred.sessionToken) : undefined;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS S3: accessKeyId and secretAccessKey are required");
  }
  return { region, accessKeyId, secretAccessKey, sessionToken };
}

function sha256(data: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)).then((h) =>
    Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  return crypto.subtle.importKey(
    "raw" as KeyFormat,
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign" as KeyUsage],
  ).then((cryptoKey) =>
    crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)).then((h) => new Uint8Array(h)),
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

  const signedHeaders = Object.keys(opts.headers).sort().map((k) => k.toLowerCase()).join(";");

  const canonicalRequest = [
    opts.method,
    opts.path,
    opts.queryString,
    ...Object.entries(opts.headers).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k.toLowerCase()}:${v}`),
    "",
    signedHeaders,
    opts.bodyHash,
  ].join("\n");

  const canonicalHash = await sha256(canonicalRequest);

  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalHash,
  ].join("\n");

  const signingKey = await getSignatureKey(opts.secretAccessKey, dateStamp, opts.region, opts.service);
  const signature = hex(await hmacSha256(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const outHeaders: Record<string, string> = {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": opts.bodyHash,
    authorization,
  };
  if (opts.sessionToken) outHeaders["x-amz-security-token"] = opts.sessionToken;
  return outHeaders;
}

async function s3Request(
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  method: string,
  path: string,
  queryString: string,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const service = "s3";
  const host = `s3.${creds.region}.amazonaws.com`;
  const bodyHash = await sha256(body ?? "");

  const headers: Record<string, string> = {
    host,
    ...extraHeaders,
  };
  if (body !== undefined) headers["content-type"] = "application/octet-stream";

  const sigHeaders = await signRequest({
    method,
    region: creds.region,
    service,
    host,
    path,
    queryString,
    headers,
    bodyHash,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
  });

  const allHeaders: Record<string, string> = { ...headers, ...sigHeaders };
  const url = `https://${host}${path}${queryString ? "?" + queryString : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const init: RequestInit = {
      method,
      headers: allHeaders,
      signal: controller.signal,
    };
    if (body !== undefined) init.body = body;
    const response = await fetch(url, init);
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
      const inner = parseXmlSimple(match[2]);
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

function parseListBuckets(xml: string): Array<{ Name: string; CreationDate: string }> {
  const root = parseXmlSimple(xml);
  const buckets = root.Buckets as Record<string, unknown> | undefined;
  if (!buckets) return [];
  const items = buckets.Bucket;
  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];
  return arr.map((b: Record<string, unknown>) => ({
    Name: String(b.Name ?? ""),
    CreationDate: String(b.CreationDate ?? ""),
  }));
}

function parseListObjects(xml: string): { objects: Array<Record<string, unknown>>; isTruncated: boolean } {
  const root = parseXmlSimple(xml);
  const contents = root.Contents;
  const objects = contents
    ? (Array.isArray(contents) ? contents : [contents]).map((c: Record<string, unknown>) => ({
        Key: String(c.Key ?? ""),
        ETag: String(c.ETag ?? "").replace(/^"/, "").replace(/"$/, ""),
        Size: c.Size ? Number(c.Size) : 0,
        LastModified: String(c.LastModified ?? ""),
        StorageClass: String(c.StorageClass ?? ""),
      }))
    : [];
  return {
    objects,
    isTruncated: String(root.IsTruncated ?? "") === "true",
  };
}

export const awsS3Executor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "bucket");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const creds = await getAwsCreds(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, creds, resource, operation, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, binary: r.binary, pairedItem });
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
  ctx: ExecutionContext,
  node: INode,
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const params = node.parameters as Record<string, unknown>;

  if (resource === "bucket") {
    return runBucketOperation(params, creds, operation, itemJson);
  }
  if (resource === "file") {
    return runFileOperation(ctx, params, creds, operation, itemJson, item);
  }
  if (resource === "folder") {
    return runFolderOperation(params, creds, operation, itemJson);
  }
  throw new Error(`AWS S3: unsupported resource "${resource}"`);
}

async function runBucketOperation(
  params: Record<string, unknown>,
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "create") {
    const name = String(getParam(params, "name", itemJson) ?? "");
    if (!name) throw new Error("AWS S3: bucket name is required");
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    const location = String(additionalFields.region ?? creds.region);
    const useCreds = { ...creds, region: location };
    // Create bucket
    const createBody = location === "us-east-1" ? undefined : `<?xml version="1.0" encoding="UTF-8"?><CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LocationConstraint>${location}</LocationConstraint></CreateBucketConfiguration>`;
    const res = await s3Request(useCreds, "PUT", `/${name}`, "", createBody);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: bucket create failed (${res.status}): ${res.body}`);
    }
    return { json: { success: true } };
  }

  if (operation === "delete") {
    const name = String(getParam(params, "name", itemJson) ?? "");
    if (!name) throw new Error("AWS S3: bucket name is required");
    const res = await s3Request(creds, "DELETE", `/${name}`, "");
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: bucket delete failed (${res.status}): ${res.body}`);
    }
    return { json: { success: true } };
  }

  if (operation === "getAll") {
    const res = await s3Request(creds, "GET", "/", "");
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: list buckets failed (${res.status}): ${res.body}`);
    }
    const buckets = parseListBuckets(res.body);
    const returnAll = Boolean(params.returnAll);
    const limit = Number(params.limit ?? 100);
    const items = returnAll ? buckets : buckets.slice(0, limit);
    return { json: items as unknown as Record<string, unknown> };
  }

  if (operation === "search") {
    const bucketName = String(getParam(params, "bucketName", itemJson) ?? "");
    if (!bucketName) throw new Error("AWS S3: bucketName is required");
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    const qs = new URLSearchParams();
    qs.set("list-type", "2");
    const prefix = String(getParam(additionalFields, "prefix", itemJson) ?? "");
    if (prefix) qs.set("prefix", prefix);
    const delimiter = String(getParam(additionalFields, "delimiter", itemJson) ?? "");
    if (delimiter) qs.set("delimiter", delimiter);
    const startAfter = String(getParam(additionalFields, "startAfter", itemJson) ?? "");
    if (startAfter) qs.set("start-after", startAfter);
    const encoding = String(getParam(additionalFields, "encodingType", itemJson) ?? "");
    if (encoding) qs.set("encoding-type", encoding);
    const fetchOwner = Boolean(getParam(additionalFields, "fetchOwner", itemJson, false));
    if (fetchOwner) qs.set("fetch-owner", "true");
    const maxKeys = Math.min(Number(params.limit ?? 100), 500);
    qs.set("max-keys", String(maxKeys));

    const res = await s3Request(creds, "GET", `/${bucketName}`, qs.toString());
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: search failed (${res.status}): ${res.body}`);
    }
    const parsed = parseListObjects(res.body);
    return { json: parsed.objects as unknown as Record<string, unknown> };
  }

  throw new Error(`AWS S3: unsupported bucket operation "${operation}"`);
}

async function runFileOperation(
  ctx: ExecutionContext,
  params: Record<string, unknown>,
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  if (operation === "copy") {
    const sourcePath = String(getParam(params, "sourcePath", itemJson) ?? "");
    const destPath = String(getParam(params, "destinationPath", itemJson) ?? "");
    if (!sourcePath || !destPath) throw new Error("AWS S3: sourcePath and destinationPath are required");

    const srcParts = parsePath(sourcePath);
    const dstParts = parsePath(destPath);

    const copySource = `/${srcParts.bucket}/${encodeURIComponent(srcParts.key)}`;
    const headers: Record<string, string> = {
      "x-amz-copy-source": copySource,
    };

    const res = await s3Request(creds, "PUT", `/${dstParts.bucket}/${encodeURIComponent(dstParts.key)}`, "", undefined, headers);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: copy failed (${res.status}): ${res.body}`);
    }
    const parsed = parseXmlSimple(res.body);
    return {
      json: {
        ETag: String((parsed.CopyObjectResult as Record<string, unknown> | undefined)?.ETag ?? "").replace(/^"/, "").replace(/"$/, ""),
        LastModified: String((parsed.CopyObjectResult as Record<string, unknown> | undefined)?.LastModified ?? ""),
      },
    };
  }

  if (operation === "delete") {
    const bucketName = String(getParam(params, "bucketName", itemJson) ?? "");
    const fileKey = String(getParam(params, "fileKey", itemJson) ?? "");
    if (!bucketName || !fileKey) throw new Error("AWS S3: bucketName and fileKey are required");
    const options = (params.options ?? {}) as Record<string, unknown>;
    let qs = "";
    const versionId = String(getParam(options, "versionId", itemJson) ?? "");
    if (versionId) qs = `versionId=${encodeURIComponent(versionId)}`;

    const res = await s3Request(creds, "DELETE", `/${bucketName}/${encodeURIComponent(fileKey)}`, qs);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: delete failed (${res.status}): ${res.body}`);
    }
    return { json: { success: true } };
  }

  if (operation === "download") {
    const bucketName = String(getParam(params, "bucketName", itemJson) ?? "");
    const fileKey = String(getParam(params, "fileKey", itemJson) ?? "");
    if (!bucketName || !fileKey) throw new Error("AWS S3: bucketName and fileKey are required");
    const binaryPropertyName = String(params.binaryPropertyName ?? "data");

    const res = await s3Request(creds, "GET", `/${bucketName}/${encodeURIComponent(fileKey)}`, "");
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: download failed (${res.status}): ${res.body}`);
    }

    const contentType = res.headers["content-type"] ?? "application/octet-stream";
    const contentLength = res.headers["content-length"];
    const eTag = res.headers.etag ? res.headers.etag.replace(/^"/, "").replace(/"$/, "") : undefined;
    const lastModified = res.headers["last-modified"];

    const binaryData: IBinaryData = {
      mimeType: contentType,
      data: Buffer.from(res.body).toString("base64"),
    };
    if (contentLength) binaryData.fileSize = Number(contentLength);

    const metadata: Record<string, unknown> = {};
    if (eTag) metadata.ETag = eTag;
    metadata.Key = fileKey;
    if (contentLength) metadata.Size = Number(contentLength);
    if (lastModified) metadata.LastModified = lastModified;
    if (contentType) metadata.StorageClass = contentType;

    return {
      json: metadata,
      binary: { [binaryPropertyName]: binaryData },
    };
  }

  if (operation === "getAll") {
    const bucketName = String(getParam(params, "bucketName", itemJson) ?? "");
    if (!bucketName) throw new Error("AWS S3: bucketName is required");
    const options = (params.options ?? {}) as Record<string, unknown>;
    const returnAll = Boolean(params.returnAll);
    const limit = Number(params.limit ?? 100);
    const maxKeys = returnAll ? 500 : Math.min(limit, 500);

    const qs = new URLSearchParams();
    qs.set("list-type", "2");
    qs.set("max-keys", String(maxKeys));
    const folderKey = String(getParam(options, "folderKey", itemJson) ?? "");
    if (folderKey) qs.set("prefix", folderKey);
    const fetchOwner = Boolean(getParam(options, "fetchOwner", itemJson, false));
    if (fetchOwner) qs.set("fetch-owner", "true");

    const res = await s3Request(creds, "GET", `/${bucketName}`, qs.toString());
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: list objects failed (${res.status}): ${res.body}`);
    }
    const parsed = parseListObjects(res.body);
    return { json: parsed.objects as unknown as Record<string, unknown> };
  }

  if (operation === "upload") {
    const bucketName = String(getParam(params, "bucketName", itemJson) ?? "");
    if (!bucketName) throw new Error("AWS S3: bucketName is required");
    const binaryData = params.binaryData !== false;
    const binaryPropertyName = String(params.binaryPropertyName ?? "data");

    let fileContent: string;
    let fileName: string;

    if (binaryData) {
      const bin = item.binary?.[binaryPropertyName];
      if (!bin) throw new Error(`AWS S3: binary property "${binaryPropertyName}" not found`);
      fileContent = atob(bin.data);
      fileName = String(bin.fileName ?? params.fileName ?? "file");
    } else {
      fileContent = String(getParam(params, "fileContent", itemJson) ?? "");
      fileName = String(getParam(params, "fileName", itemJson) ?? "file");
    }

    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    const headers: Record<string, string> = {
      "content-type": "application/octet-stream",
    };
    const acl = String(getParam(additionalFields, "acl", itemJson) ?? "");
    if (acl) headers["x-amz-acl"] = acl;

    const res = await s3Request(creds, "PUT", `/${bucketName}/${encodeURIComponent(fileName)}`, "", fileContent, headers);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: upload failed (${res.status}): ${res.body}`);
    }

    const eTag = res.headers.etag ? res.headers.etag.replace(/^"/, "").replace(/"$/, "") : undefined;

    return {
      json: {
        ETag: eTag ?? "",
        Key: fileName,
        Location: `https://${bucketName}.s3.${creds.region}.amazonaws.com/${fileName}`,
        Bucket: bucketName,
      },
    };
  }

  throw new Error(`AWS S3: unsupported file operation "${operation}"`);
}

async function runFolderOperation(
  params: Record<string, unknown>,
  creds: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const bucketName = String(getParam(params, "bucketName", itemJson) ?? "");
  if (!bucketName) throw new Error("AWS S3: bucketName is required");

  if (operation === "create") {
    const folderName = String(getParam(params, "folderName", itemJson) ?? "");
    if (!folderName) throw new Error("AWS S3: folderName is required");
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    const parentFolderKey = String(getParam(additionalFields, "parentFolderKey", itemJson) ?? "");
    const key = parentFolderKey ? `${parentFolderKey}${folderName}/` : `${folderName}/`;

    const headers: Record<string, string> = { "content-type": "application/octet-stream" };
    const res = await s3Request(creds, "PUT", `/${bucketName}/${encodeURIComponent(key)}`, "", "", headers);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: folder create failed (${res.status}): ${res.body}`);
    }
    return { json: { success: true } };
  }

  if (operation === "delete") {
    const folderKey = String(getParam(params, "folderKey", itemJson) ?? "");
    if (!folderKey) throw new Error("AWS S3: folderKey is required");
    const key = folderKey.endsWith("/") ? folderKey : `${folderKey}/`;

    const res = await s3Request(creds, "DELETE", `/${bucketName}/${encodeURIComponent(key)}`, "");
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: folder delete failed (${res.status}): ${res.body}`);
    }
    return { json: { success: true } };
  }

  if (operation === "getAll") {
    const options = (params.options ?? {}) as Record<string, unknown>;
    const returnAll = Boolean(params.returnAll);
    const limit = Number(params.limit ?? 100);
    const maxKeys = returnAll ? 500 : Math.min(limit, 500);

    const qs = new URLSearchParams();
    qs.set("list-type", "2");
    qs.set("max-keys", String(maxKeys));
    qs.set("delimiter", "/");
    const folderKey = String(getParam(options, "folderKey", itemJson) ?? "");
    if (folderKey) qs.set("prefix", folderKey);
    const fetchOwner = Boolean(getParam(options, "fetchOwner", itemJson, false));
    if (fetchOwner) qs.set("fetch-owner", "true");

    const res = await s3Request(creds, "GET", `/${bucketName}`, qs.toString());
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AWS S3: list folders failed (${res.status}): ${res.body}`);
    }

    const root = parseXmlSimple(res.body);
    const prefixes = root.CommonPrefixes;
    const items = prefixes
      ? (Array.isArray(prefixes) ? prefixes : [prefixes]).map((p: Record<string, unknown>) => ({
          Key: String(p.Prefix ?? ""),
        }))
      : [];

    return { json: items as unknown as Record<string, unknown> };
  }

  throw new Error(`AWS S3: unsupported folder operation "${operation}"`);
}

function parsePath(path: string): { bucket: string; key: string } {
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  const slashIdx = cleaned.indexOf("/");
  if (slashIdx === -1) return { bucket: cleaned, key: "" };
  return { bucket: cleaned.slice(0, slashIdx), key: cleaned.slice(slashIdx + 1) };
}
