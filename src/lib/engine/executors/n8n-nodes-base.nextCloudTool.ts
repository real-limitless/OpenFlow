/**
 * Nextcloud (AI Tool) executor.
 *
 * Tool variant that shares the three resources (File, Folder, User) and all
 * operations with the base Nextcloud node. Delegates to the same WebDAV/OCS
 * helpers used by nextCloud.ts.
 */
import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";

/* -------------------------------------------------------------------------- */
/*  Shared helpers (copy of nextCloud.ts helpers to keep clean-room)          */
/* -------------------------------------------------------------------------- */

const WEBDAV_BASE = "/remote.php/dav/files";

async function getWebDavUrl(ctx: ExecutionContext): Promise<string> {
  const cred = (await ctx.getCredential("nextCloudApi")) ?? (await ctx.getCredential("nextCloudOAuth2Api"));
  if (!cred) throw new Error("Nextcloud: credential is not configured");
  const url = String(cred.webDavUrl ?? cred.url ?? cred.baseUrl ?? "");
  if (!url) throw new Error("Nextcloud: webDavUrl is not set in credential");
  return url.replace(/\/+$/, "");
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const basicCred = await ctx.getCredential("nextCloudApi");
  if (basicCred && basicCred.user && basicCred.password) {
    const encoded = Buffer.from(`${basicCred.user}:${basicCred.password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  const oauthCred = await ctx.getCredential("nextCloudOAuth2Api");
  if (oauthCred && oauthCred.accessToken) {
    return { Authorization: `Bearer ${oauthCred.accessToken}` };
  }
  throw new Error("Nextcloud: no valid credential found");
}

async function webdavRequest(
  baseUrl: string, headers: Record<string, string>, method: string,
  path: string, body?: string | ArrayBuffer,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const url = `${baseUrl}${WEBDAV_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, "Content-Type": "application/octet-stream", "X-Requested-With": "XMLHttpRequest" },
    body,
  });
  const text = await res.text();
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });
  if (res.status >= 400) throw new Error(`Nextcloud WebDAV error: ${res.status} ${res.statusText}`);
  return { status: res.status, body: text, headers: respHeaders };
}

async function ocsRequest(
  baseUrl: string, headers: Record<string, string>, endpoint: string,
  method = "GET", body?: URLSearchParams,
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/ocs/v2.php${endpoint}?format=json`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, "OCS-APIRequest": "true", "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body?.toString(),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { throw new Error(`Nextcloud OCS error: ${res.status} ${res.statusText}`); }
  const ocs = (parsed as Record<string, unknown>)?.ocs as Record<string, unknown> ?? {};
  if (ocs.meta && (ocs.meta as Record<string, unknown>).statuscode !== 100) {
    const msg = (ocs.meta as Record<string, unknown>).message ?? "unknown OCS error";
    throw new Error(`Nextcloud OCS error: ${msg}`);
  }
  return ocs;
}

function resolveParam(node: INode, name: string, fallback?: string): string {
  const val = node.parameters[name];
  if (val == null || val === "") return fallback ?? "";
  return String(val);
}

async function runFileUpload(
  node: INode, headers: Record<string, string>, baseUrl: string,
  _itemJson: Record<string, unknown>, binaryData: Record<string, IBinaryData> | undefined,
): Promise<Record<string, unknown>> {
  const filePath = resolveParam(node, "filePath");
  if (!filePath) throw new Error("Nextcloud: filePath is required for upload");
  const binaryProperty = resolveParam(node, "binaryPropertyName", "data");
  let content: string | ArrayBuffer;
  if (binaryData && binaryData[binaryProperty]) {
    content = binaryData[binaryProperty].data ?? "";
  } else {
    content = resolveParam(node, "fileContent");
  }
  await webdavRequest(baseUrl, headers, "PUT", filePath, content);
  return { success: true, path: filePath };
}

async function runFileDownload(
  node: INode, headers: Record<string, string>, baseUrl: string,
  binaryPropertyName?: string,
): Promise<Record<string, unknown>> {
  const filePath = resolveParam(node, "filePath");
  if (!filePath) throw new Error("Nextcloud: filePath is required for download");
  const { body, headers: respHeaders } = await webdavRequest(baseUrl, headers, "GET", filePath);
  const metadata: Record<string, unknown> = {
    contentLength: respHeaders["content-length"] ?? String(body.length),
    contentType: respHeaders["content-type"] ?? "application/octet-stream",
    eTag: respHeaders["etag"] ?? "",
    lastModified: respHeaders["last-modified"] ?? "",
    path: filePath,
    type: "file",
  };
  const binaryProp = binaryPropertyName || "data";
  const binary: Record<string, { data: string; mimeType: string; fileName: string }> = {
    [binaryProp]: {
      data: Buffer.from(body, "utf-8").toString("base64"),
      mimeType: (respHeaders["content-type"] ?? "application/octet-stream"),
      fileName: filePath.split("/").pop() || "file",
    },
  };
  return { json: metadata, binary };
}

async function runFileCopy(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>> {
  const sourcePath = resolveParam(node, "sourcePath") || resolveParam(node, "filePath") || resolveParam(node, "folderPath");
  const destinationPath = resolveParam(node, "destinationPath");
  if (!sourcePath || !destinationPath) throw new Error("Nextcloud: sourcePath and destinationPath are required for copy");
  await webdavRequest(baseUrl, { ...headers, Destination: `${baseUrl}${WEBDAV_BASE}${destinationPath}`, Overwrite: "F" }, "COPY", sourcePath);
  return { success: true, source: sourcePath, destination: destinationPath };
}

async function runFileMove(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>> {
  const sourcePath = resolveParam(node, "sourcePath") || resolveParam(node, "filePath") || resolveParam(node, "folderPath");
  const destinationPath = resolveParam(node, "destinationPath");
  if (!sourcePath || !destinationPath) throw new Error("Nextcloud: sourcePath and destinationPath are required for move");
  await webdavRequest(baseUrl, { ...headers, Destination: `${baseUrl}${WEBDAV_BASE}${destinationPath}` }, "MOVE", sourcePath);
  return { success: true, source: sourcePath, destination: destinationPath };
}

async function runFileDelete(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>> {
  const filePath = resolveParam(node, "filePath") || resolveParam(node, "folderPath");
  if (!filePath) throw new Error("Nextcloud: filePath is required for delete");
  await webdavRequest(baseUrl, headers, "DELETE", filePath);
  return { success: true, path: filePath };
}

async function runFileShare(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>> {
  const filePath = resolveParam(node, "filePath") || resolveParam(node, "folderPath");
  if (!filePath) throw new Error("Nextcloud: filePath is required for share");
  const shareType = Number(node.parameters.shareType ?? 3);
  const shareWith = resolveParam(node, "shareRecipient");
  const params = new URLSearchParams();
  params.set("path", filePath); params.set("shareType", String(shareType));
  if (shareWith) params.set("shareWith", shareWith);
  return ocsRequest(baseUrl, headers, "/apps/files_sharing/api/v1/shares", "POST", params);
}

async function runFolderCreate(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>> {
  const folderPath = resolveParam(node, "folderPath");
  if (!folderPath) throw new Error("Nextcloud: folderPath is required for create folder");
  await webdavRequest(baseUrl, headers, "MKCOL", folderPath);
  return { success: true, path: folderPath };
}

async function runFolderList(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>[]> {
  const folderPath = resolveParam(node, "folderPath");
  if (!folderPath) throw new Error("Nextcloud: folderPath is required for list folder");
  const { body } = await webdavRequest(baseUrl, { ...headers, Depth: "1" }, "PROPFIND", folderPath);
  return parsePropfindResponse(body);
}

function parsePropfindResponse(xml: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  const hrefRegex = /<d:href>([^<]+)<\/d:href>/g;
  const hrefs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = hrefRegex.exec(xml)) !== null) hrefs.push(m[1]);
  const resourceTypeRegex = /<d:resourcetype>([\s\S]*?)<\/d:resourcetype>/g;
  const types: string[] = [];
  while ((m = resourceTypeRegex.exec(xml)) !== null) {
    types.push(m[1].includes("collection") ? "directory" : "file");
  }
  const getContentLength = /<d:getcontentlength[^>]*>([^<]*)<\/d:getcontentlength>/g;
  const lengths: string[] = [];
  while ((m = getContentLength.exec(xml)) !== null) lengths.push(m[1]);
  const getContentType = /<d:getcontenttype[^>]*>([^<]*)<\/d:getcontenttype>/g;
  const contentTypes: string[] = [];
  while ((m = getContentType.exec(xml)) !== null) contentTypes.push(m[1]);
  const maxLen = Math.max(hrefs.length, types.length, lengths.length, contentTypes.length);
  for (let i = 0; i < maxLen; i++) {
    items.push({ path: hrefs[i] ?? "", type: types[i] ?? "file", contentLength: lengths[i] ?? "0", contentType: contentTypes[i] ?? "" });
  }
  return items;
}

async function runUserInvite(
  node: INode, headers: Record<string, string>, baseUrl: string, itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const userId = resolveParam(node, "userId") ?? String(itemJson.userId ?? "");
  const rawData = node.parameters.data as Record<string, unknown> | undefined ?? {};
  const email = String(rawData.email ?? (itemJson.email ?? ""));
  const params = new URLSearchParams();
  params.set("userid", userId);
  if (email) params.set("email", email);
  const displayName = resolveParam(node, "displayName") ?? String(rawData.displayName ?? "");
  if (displayName) params.set("displayName", displayName);
  const groups = node.parameters.groups as string[] | undefined;
  if (groups?.length) params.set("groups", JSON.stringify(groups));
  const result = await ocsRequest(baseUrl, headers, "/cloud/users", "POST", params);
  return { userId, email, ...result };
}

async function runUserDelete(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>> {
  const userId = resolveParam(node, "userId");
  if (!userId) throw new Error("Nextcloud: userId is required for delete user");
  await ocsRequest(baseUrl, headers, `/cloud/users/${encodeURIComponent(userId)}`, "DELETE");
  return { success: true, userId };
}

async function runUserGet(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>> {
  const userId = resolveParam(node, "userId");
  if (!userId) throw new Error("Nextcloud: userId is required for get user");
  const result = await ocsRequest(baseUrl, headers, `/cloud/users/${encodeURIComponent(userId)}`);
  return (result.data ?? {}) as Record<string, unknown>;
}

async function runUserGetAll(
  _node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>[]> {
  const result = await ocsRequest(baseUrl, headers, "/cloud/users");
  const data = result.data as Record<string, unknown> ?? {};
  const users = data.users as string[] ?? [];
  return users.map((u) => ({ userId: u }));
}

async function runUserEdit(
  node: INode, headers: Record<string, string>, baseUrl: string,
): Promise<Record<string, unknown>> {
  const userId = resolveParam(node, "userId");
  if (!userId) throw new Error("Nextcloud: userId is required for edit user");
  const rawData = node.parameters.data as Record<string, unknown> | undefined ?? {};
  const params = new URLSearchParams();
  const keyMap: Record<string, string> = { email: "email", displayName: "displayname", quota: "quota", language: "language" };
  for (const [paramKey, ocsKey] of Object.entries(keyMap)) {
    const val = rawData[paramKey];
    if (val != null) params.set(ocsKey, String(val));
  }
  await ocsRequest(baseUrl, headers, `/cloud/users/${encodeURIComponent(userId)}`, "PUT", params);
  return { success: true, userId };
}

async function runOperation(
  ctx: ExecutionContext, node: INode, headers: Record<string, string>, baseUrl: string,
  resource: string, operation: string, itemJson: Record<string, unknown>,
  binaryData: Record<string, IBinaryData> | undefined,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (resource === "file") {
    if (operation === "upload") return runFileUpload(node, headers, baseUrl, itemJson, binaryData);
    if (operation === "download") {
      const binaryProp = resolveParam(node, "binaryPropertyName", "data");
      return runFileDownload(node, headers, baseUrl, binaryProp);
    }
    if (operation === "copy") return runFileCopy(node, headers, baseUrl);
    if (operation === "move") return runFileMove(node, headers, baseUrl);
    if (operation === "delete") return runFileDelete(node, headers, baseUrl);
    if (operation === "share") return runFileShare(node, headers, baseUrl);
  }
  if (resource === "folder") {
    if (operation === "create") return runFolderCreate(node, headers, baseUrl);
    if (operation === "list") return runFolderList(node, headers, baseUrl);
    if (operation === "copy") return runFileCopy(node, headers, baseUrl);
    if (operation === "move") return runFileMove(node, headers, baseUrl);
    if (operation === "delete") return runFileDelete(node, headers, baseUrl);
    if (operation === "share") return runFileShare(node, headers, baseUrl);
  }
  if (resource === "user") {
    if (operation === "invite") return runUserInvite(node, headers, baseUrl, itemJson);
    if (operation === "delete") return runUserDelete(node, headers, baseUrl);
    if (operation === "get") return runUserGet(node, headers, baseUrl);
    if (operation === "getAll") return runUserGetAll(node, headers, baseUrl);
    if (operation === "edit") return runUserEdit(node, headers, baseUrl);
  }
  throw new Error(`Nextcloud: unsupported resource "${resource}" / operation "${operation}"`);
}

export const nextCloudToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "file");
  const operation = String(node.parameters.operation ?? "list");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const binaryData = item.binary;
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const baseUrl = await getWebDavUrl(ctx);
      const headers = await getAuthHeaders(ctx);
      const result = await runOperation(ctx, node, headers, baseUrl, resource, operation, itemJson, binaryData);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        if (r && typeof r === "object" && "json" in r && "binary" in r) {
          out.push(r as INodeExecutionData);
        } else if (r && typeof r === "object" && "binary" in r) {
          out.push({ json: (r as Record<string, unknown>).json as Record<string, unknown> ?? {}, binary: (r as Record<string, unknown>).binary as INodeExecutionData["binary"], pairedItem });
        } else {
          out.push({ json: r as Record<string, unknown>, pairedItem });
        }
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      out.push({ json: {}, pairedItem: pairedItem as { item: number; input: number } });
    }
  }

  return [out];
};
