import { createHmac } from "node:crypto";
import type { NodeExecutor, INodeExecutionData } from "@/sdk";

function resolveLocator(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (obj.mode === "id" || obj.mode === "name") return String(obj.value ?? "");
    return String(obj.value ?? "");
  }
  return String(v ?? "");
}

function buildBaseUrl(account: string): string {
  return `https://${account}.blob.core.windows.net`;
}

function utcDate(): string {
  return new Date().toUTCString();
}

export function hmacSha256(key: string, data: string): string {
  const keyBytes = Buffer.from(key, "base64");
  return createHmac("sha256", keyBytes).update(data, "utf8").digest("base64");
}

function buildCanonicalizedResource(
  account: string,
  container: string,
  blob?: string,
  queryParams?: Record<string, string>,
): string {
  let resource = `/${account}/${container}`;
  if (blob) resource += `/${blob}`;
  if (queryParams) {
    const comp = queryParams["comp"];
    const restype = queryParams["restype"];
    if (comp) resource += `\ncomp:${comp}`;
    if (restype) resource += `\nrestype:${restype}`;
  }
  return resource;
}

function buildStringToSign(
  method: string,
  headers: Record<string, string>,
  canonicalizedResource: string,
): string {
  return [
    method,
    headers["Content-Encoding"] ?? "",
    headers["Content-Language"] ?? "",
    headers["Content-Length"] ?? "",
    headers["Content-MD5"] ?? "",
    headers["Content-Type"] ?? "",
    headers["Date"] ?? "",
    headers["If-Modified-Since"] ?? "",
    headers["If-Match"] ?? "",
    headers["If-None-Match"] ?? "",
    headers["If-Unmodified-Since"] ?? "",
    headers["Range"] ?? "",
    buildCanonicalizedHeaders(headers),
    canonicalizedResource,
  ].join("\n");
}

function buildCanonicalizedHeaders(headers: Record<string, string>): string {
  const msHeaders: string[] = [];
  for (const key of Object.keys(headers).sort()) {
    const lower = key.toLowerCase();
    if (lower.startsWith("x-ms-")) {
      msHeaders.push(`${lower}:${headers[key]}`);
    }
  }
  return msHeaders.join("\n");
}

function collectCollection(
  params: Record<string, unknown>,
  containerName: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  const container = params[containerName] as
    | Record<string, unknown>
    | undefined;
  if (!container) return out;
  const values = container["values"] as Array<Record<string, unknown>>;
  if (!values) return out;
  for (const entry of values) {
    const name = String(entry["name"] ?? "");
    const value = String(entry["value"] ?? "");
    if (name) out[name] = value;
  }
  return out;
}

function buildTagsHeader(tags: Record<string, string>): string {
  return Object.entries(tags)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function parseXmlEnumerationResults(xml: string): any[] {
  const results: any[] = [];

  const itemRegex = /<(Blob|Container)>[\s\S]*?<Name>([^<]*)<\/Name>[\s\S]*?<Properties>([\s\S]*?)<\/Properties>[\s\S]*?<\/(Blob|Container)>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const name = match[2];
    const props = match[3];
    const entry: Record<string, unknown> = { name };
    const propRegex = /<([\w-]+)>([^<]*)<\/\1>/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRegex.exec(props)) !== null) {
      const raw = pm[1];
      const key = raw.charAt(0).toLowerCase() + raw.slice(1).replace(/-(.)/g, (_, c) => c.toUpperCase());
      entry[key] = pm[2];
    }
    results.push(entry);
  }
  return results;
}

function extractHeaders(
  headers: Headers,
): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export const azureStorageExecutor: NodeExecutor = async (ctx, node) => {
  const params = node.parameters ?? {};
  const resource = String(params["resource"] ?? "blob");
  const operation = String(params["operation"] ?? "getAll");
  const options = (params["options"] as Record<string, unknown>) ?? {};

  const authMethod = String(params["authentication"] ?? "sharedKey");
  let baseUrl: string;
  let account: string;
  let key: string | undefined;
  let bearerToken: string | undefined;

  if (authMethod === "oAuth2") {
    const cred = await ctx.getCredential("azureStorageOAuth2Api");
    if (!cred || !cred["account"]) {
      throw new Error(
        'Azure Storage OAuth2 credential "azureStorageOAuth2Api" is required',
      );
    }
    account = String(cred["account"]);
    baseUrl = buildBaseUrl(account);
    key = undefined;
    bearerToken =
      String(cred["accessToken"] ?? "") ||
      String((cred["oauthTokenData"] as Record<string, unknown>)?.["access_token"] ?? "");
    if (!bearerToken) {
      throw new Error("Azure Storage OAuth2 credential is missing an access token");
    }
  } else {
    const cred = await ctx.getCredential("azureStorageSharedKeyApi");
    if (!cred || !cred["account"] || !cred["key"]) {
      throw new Error(
        'Azure Storage Shared Key credential "azureStorageSharedKeyApi" with account and key is required',
      );
    }
    account = String(cred["account"]);
    key = String(cred["key"]);
    baseUrl = buildBaseUrl(account);
  }

  const container = resolveLocator(params["container"]);

  if (resource === "container") {
    return handleContainerOperation(
      ctx,
      operation,
      container,
      params,
      options,
      baseUrl,
      account,
      key,
      bearerToken,
    );
  }

  return handleBlobOperation(
    ctx,
    operation,
    container,
    params,
    options,
    baseUrl,
    account,
    key,
    bearerToken,
  );
};

async function handleContainerOperation(
  ctx: Parameters<NodeExecutor>[0],
  operation: string,
  container: string,
  params: Record<string, unknown>,
  options: Record<string, unknown>,
  baseUrl: string,
  account: string,
  key?: string,
  bearerToken?: string,
): Promise<INodeExecutionData[][]> {
  const items = ctx.getInputItems(0);

  switch (operation) {
    case "create": {
      const containerName =
        resolveLocator(params["container"]) ||
        String(params["containerName"] ?? "");
      const url = `${baseUrl}/${containerName}?restype=container`;
      const headers: Record<string, string> = {
        "x-ms-date": utcDate(),
        "x-ms-version": "2021-12-02",
      };
      const accessLevel = options["accessLevel"] as string | undefined;
      if (accessLevel && accessLevel !== "Private" && accessLevel !== "") {
        headers["x-ms-blob-public-access"] = accessLevel;
      }
      const metadata = collectCollection(params, "metadata");
      for (const [mk, mv] of Object.entries(metadata)) {
        headers[`x-ms-meta-${mk}`] = mv;
      }

      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      } else if (key) {
        headers["Content-Length"] = "0";
        const canonicalizedResource = buildCanonicalizedResource(
          account,
          containerName,
          undefined,
          { restype: "container" },
        );
        const stringToSign = buildStringToSign("PUT", headers, canonicalizedResource);
        headers["Authorization"] = `SharedKey ${account}:${hmacSha256(key, stringToSign)}`;
      }

      const res = await fetch(url, { method: "PUT", headers });
      if (!res.ok) {
        throw new Error(
          `Azure Storage container create failed: ${res.status} ${res.statusText}`,
        );
      }
      const resHeaders = extractHeaders(res.headers);
      return [
        [
          {
            json: {
              container: containerName,
              created: true,
              etag: resHeaders["etag"] ?? null,
              lastModified: resHeaders["last-modified"] ?? null,
            },
            pairedItem: { item: 0, input: 0 },
          },
        ],
      ];
    }
    case "delete": {
      const url = `${baseUrl}/${container}?restype=container`;
      const headers: Record<string, string> = {
        "x-ms-date": utcDate(),
        "x-ms-version": "2021-12-02",
      };
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      } else if (key) {
        const canonicalizedResource = buildCanonicalizedResource(
          account,
          container,
          undefined,
          { restype: "container" },
        );
        const stringToSign = buildStringToSign("DELETE", headers, canonicalizedResource);
        headers["Authorization"] = `SharedKey ${account}:${hmacSha256(key, stringToSign)}`;
      }
      const res = await fetch(url, { method: "DELETE", headers });
      if (!res.ok) {
        throw new Error(
          `Azure Storage container delete failed: ${res.status} ${res.statusText}`,
        );
      }
      return [
        [
          {
            json: { container, deleted: true },
            pairedItem: { item: 0, input: 0 },
          },
        ],
      ];
    }
    case "get": {
      const url = `${baseUrl}/${container}?restype=container`;
      const headers: Record<string, string> = {
        "x-ms-date": utcDate(),
        "x-ms-version": "2021-12-02",
      };
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      } else if (key) {
        const canonicalizedResource = buildCanonicalizedResource(
          account,
          container,
          undefined,
          { restype: "container" },
        );
        const stringToSign = buildStringToSign("GET", headers, canonicalizedResource);
        headers["Authorization"] = `SharedKey ${account}:${hmacSha256(key, stringToSign)}`;
      }
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) {
        throw new Error(
          `Azure Storage container get failed: ${res.status} ${res.statusText}`,
        );
      }
      const resHeaders = extractHeaders(res.headers);
      const simplify = options["simplify"] !== false;
      if (simplify) {
        return [
          [
            {
              json: {
                name: container,
                etag: resHeaders["etag"] ?? null,
                lastModified: resHeaders["last-modified"] ?? null,
                leaseStatus: resHeaders["x-ms-lease-status"] ?? null,
                leaseState: resHeaders["x-ms-lease-state"] ?? null,
                publicAccess: resHeaders["x-ms-blob-public-access"] ?? null,
                hasImmutabilityPolicy:
                  resHeaders["x-ms-has-immutability-policy"] ?? null,
                hasLegalHold: resHeaders["x-ms-has-legal-hold"] ?? null,
              },
              pairedItem: { item: 0, input: 0 },
            },
          ],
        ];
      }
      return [
        [
          {
            json: {
              name: container,
              headers: resHeaders,
            },
            pairedItem: { item: 0, input: 0 },
          },
        ],
      ];
    }
    case "getAll": {
      const url = new URL(`${baseUrl}/?comp=list`);
      const filter = options["filter"] as string | undefined;
      const returnAll = params["returnAll"] === true;
      const limit = Number(params["limit"] ?? 50);
      if (filter) url.searchParams.set("prefix", filter);
      if (!returnAll) url.searchParams.set("maxresults", String(Math.max(1, limit)));
      const fields = params["fields"] as Array<string> | undefined;
      if (fields && fields.length > 0) {
        url.searchParams.set("include", fields.join(","));
      }
      const headers: Record<string, string> = {
        "x-ms-date": utcDate(),
        "x-ms-version": "2021-12-02",
      };
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      } else if (key) {
        const canonicalizedResource = buildCanonicalizedResource(
          account,
          "",
          undefined,
          { comp: "list" },
        );
        const stringToSign = buildStringToSign(
          "GET",
          headers,
          canonicalizedResource,
        );
        headers["Authorization"] = `SharedKey ${account}:${hmacSha256(key, stringToSign)}`;
      }
      const res = await fetch(url.toString(), { method: "GET", headers });
      if (!res.ok) {
        throw new Error(
          `Azure Storage container list failed: ${res.status} ${res.statusText}`,
        );
      }
      const xml = await res.text();
      const parsed = parseXmlEnumerationResults(xml);
      const simplify = options["simplify"] !== false;
      const mapped = simplify
        ? parsed.map((p) => ({
            name: p["name"],
            lastModified: p["lastModified"] ?? p["lastmodified"] ?? null,
            etag: p["etag"] ?? null,
            leaseStatus: p["leaseStatus"] ?? p["leasestatus"] ?? null,
            leaseState: p["leaseState"] ?? p["leasestate"] ?? null,
            publicAccess: p["publicAccess"] ?? p["publicaccess"] ?? null,
          }))
        : parsed;
      return [[{ json: mapped, pairedItem: { item: 0, input: 0 } }]];
    }
    default:
      throw new Error(`Unknown container operation: ${operation}`);
  }
}

async function handleBlobOperation(
  ctx: Parameters<NodeExecutor>[0],
  operation: string,
  container: string,
  params: Record<string, unknown>,
  options: Record<string, unknown>,
  baseUrl: string,
  account: string,
  key?: string,
  bearerToken?: string,
): Promise<INodeExecutionData[][]> {
  const items = ctx.getInputItems(0);

  switch (operation) {
    case "create": {
      const blobName = resolveLocator(params["blobCreate"] ?? params["blob"]);
      const from = String(params["from"] ?? "binary");
      let bodyBytes: Uint8Array;
      let contentType = String(options["contentType"] ?? "");

      if (from === "url") {
        const url = String(params["url"] ?? "");
        if (!url) throw new Error("URL parameter is required when from=url");
        const remoteRes = await fetch(url);
        const buf = await remoteRes.arrayBuffer();
        bodyBytes = new Uint8Array(buf);
        if (!contentType) {
          contentType = remoteRes.headers.get("content-type") ?? "application/octet-stream";
        }
      } else {
        const binaryProp = String(params["binaryPropertyName"] ?? "data");
        const inputItem = items[0];
        if (!inputItem?.binary?.[binaryProp]) {
          throw new Error(
            `Binary property "${binaryProp}" not found on input item`,
          );
        }
        const binaryData = inputItem.binary[binaryProp].data;
        bodyBytes = Uint8Array.from(atob(binaryData), (c) => c.charCodeAt(0));
        if (!contentType) {
          contentType =
            inputItem.binary[binaryProp].mimeType ?? "application/octet-stream";
        }
      }

      const url = `${baseUrl}/${container}/${encodeURIComponent(blobName)}`;
      const headers: Record<string, string> = {
        "x-ms-date": utcDate(),
        "x-ms-version": "2021-12-02",
        "x-ms-blob-type": String(options["blobType"] ?? "BlockBlob"),
        "Content-Length": String(bodyBytes.length),
        "Content-Type": contentType,
      };

      const accessTier = options["accessTier"] as string | undefined;
      if (accessTier) headers["x-ms-access-tier"] = accessTier;
      const cacheControl = options["cacheControl"] as string | undefined;
      if (cacheControl) headers["Cache-Control"] = cacheControl;
      const contentDisposition = options["contentDisposition"] as string | undefined;
      if (contentDisposition) headers["Content-Disposition"] = contentDisposition;
      const contentEncoding = options["contentEncoding"] as string | undefined;
      if (contentEncoding) headers["Content-Encoding"] = contentEncoding;
      const contentLanguage = options["contentLanguage"] as string | undefined;
      if (contentLanguage) headers["Content-Language"] = contentLanguage;

      const tags = collectCollection(options, "tags");
      if (Object.keys(tags).length > 0) {
        headers["x-ms-tags"] = buildTagsHeader(tags);
      }
      const metadata = collectCollection(options, "metadata");
      for (const [mk, mv] of Object.entries(metadata)) {
        headers[`x-ms-meta-${mk}`] = mv;
      }

      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      } else if (key) {
        const canonicalizedResource = buildCanonicalizedResource(
          account,
          container,
          blobName,
        );
        const stringToSign = buildStringToSign("PUT", headers, canonicalizedResource);
        headers["Authorization"] = `SharedKey ${account}:${hmacSha256(key, stringToSign)}`;
      }

      const res = await fetch(url, {
        method: "PUT",
        headers,
        body: bodyBytes as BodyInit,
      });
      if (!res.ok) {
        throw new Error(
          `Azure Storage blob create failed: ${res.status} ${res.statusText}`,
        );
      }
      const resHeaders = extractHeaders(res.headers);
      return [
        [
          {
            json: {
              container,
              blobName,
              etag: resHeaders["etag"] ?? null,
              lastModified: resHeaders["last-modified"] ?? null,
              xMsRequestId: resHeaders["x-ms-request-id"] ?? null,
            },
            pairedItem: { item: 0, input: 0 },
          },
        ],
      ];
    }
    case "delete": {
      const blobName = resolveLocator(params["blob"]);
      const url = `${baseUrl}/${container}/${encodeURIComponent(blobName)}`;
      const headers: Record<string, string> = {
        "x-ms-date": utcDate(),
        "x-ms-version": "2021-12-02",
      };
      const leaseId = options["leaseId"] as string | undefined;
      if (leaseId) headers["x-ms-lease-id"] = leaseId;
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      } else if (key) {
        const canonicalizedResource = buildCanonicalizedResource(
          account,
          container,
          blobName,
        );
        const stringToSign = buildStringToSign("DELETE", headers, canonicalizedResource);
        headers["Authorization"] = `SharedKey ${account}:${hmacSha256(key, stringToSign)}`;
      }
      const res = await fetch(url, { method: "DELETE", headers });
      if (!res.ok) {
        throw new Error(
          `Azure Storage blob delete failed: ${res.status} ${res.statusText}`,
        );
      }
      return [
        [
          {
            json: { container, blobName, deleted: true },
            pairedItem: { item: 0, input: 0 },
          },
        ],
      ];
    }
    case "get": {
      const blobName = resolveLocator(params["blob"]);
      const url = `${baseUrl}/${container}/${encodeURIComponent(blobName)}`;
      const headers: Record<string, string> = {
        "x-ms-date": utcDate(),
        "x-ms-version": "2021-12-02",
      };
      const leaseId = options["leaseId"] as string | undefined;
      if (leaseId) headers["x-ms-lease-id"] = leaseId;
      const origin = options["origin"] as string | undefined;
      if (origin) headers["Origin"] = origin;
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      } else if (key) {
        const canonicalizedResource = buildCanonicalizedResource(
          account,
          container,
          blobName,
        );
        const stringToSign = buildStringToSign("GET", headers, canonicalizedResource);
        headers["Authorization"] = `SharedKey ${account}:${hmacSha256(key, stringToSign)}`;
      }
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) {
        throw new Error(
          `Azure Storage blob get failed: ${res.status} ${res.statusText}`,
        );
      }
      const resHeaders = extractHeaders(res.headers);
      const buf = await res.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(buf)),
      );
      const binaryProp = String(options["binaryPropertyName"] ?? "data");
      const simplify = options["simplify"] !== false;
      return [
        [
          {
            json: simplify
              ? {
                  contentType: resHeaders["content-type"] ?? null,
                  contentLength: resHeaders["content-length"] ?? null,
                  etag: resHeaders["etag"] ?? null,
                  lastModified: resHeaders["last-modified"] ?? null,
                  xMsRequestId: resHeaders["x-ms-request-id"] ?? null,
                }
              : { headers: resHeaders },
            binary: {
              [binaryProp]: {
                data: base64,
                mimeType:
                  resHeaders["content-type"] ?? "application/octet-stream",
                fileName: blobName,
              },
            },
            pairedItem: { item: 0, input: 0 },
          },
        ],
      ];
    }
    case "getAll": {
      const url = new URL(
        `${baseUrl}/${container}?restype=container&comp=list`,
      );
      const filter = options["filter"] as string | undefined;
      const returnAll = params["returnAll"] === true;
      const limit = Number(params["limit"] ?? 50);
      if (filter) url.searchParams.set("prefix", filter);
      if (!returnAll) url.searchParams.set("maxresults", String(Math.max(1, limit)));
      const fields = params["fields"] as Array<string> | undefined;
      if (fields && fields.length > 0) {
        url.searchParams.set("include", fields.join(","));
      }
      const headers: Record<string, string> = {
        "x-ms-date": utcDate(),
        "x-ms-version": "2021-12-02",
      };
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      } else if (key) {
        const canonicalizedResource = buildCanonicalizedResource(
          account,
          container,
          undefined,
          { comp: "list", restype: "container" },
        );
        const stringToSign = buildStringToSign(
          "GET",
          headers,
          canonicalizedResource,
        );
        headers["Authorization"] = `SharedKey ${account}:${hmacSha256(key, stringToSign)}`;
      }
      const res = await fetch(url.toString(), { method: "GET", headers });
      if (!res.ok) {
        throw new Error(
          `Azure Storage blob list failed: ${res.status} ${res.statusText}`,
        );
      }
      const xml = await res.text();
      const parsed = parseXmlEnumerationResults(xml);
      const simplify = options["simplify"] !== false;
      const mapped = simplify
        ? parsed.map((p) => ({
            name: p["name"],
            contentLength: p["contentLength"] ?? p["contentlength"] ?? null,
            contentType: p["contentType"] ?? p["contenttype"] ?? null,
            lastModified: p["lastModified"] ?? p["lastmodified"] ?? null,
            etag: p["etag"] ?? null,
            blobType: p["blobType"] ?? p["blobtype"] ?? null,
            accessTier: p["accessTier"] ?? p["accesstier"] ?? null,
          }))
        : parsed;
      return [[{ json: mapped, pairedItem: { item: 0, input: 0 } }]];
    }
    default:
      throw new Error(`Unknown blob operation: ${operation}`);
  }
}
