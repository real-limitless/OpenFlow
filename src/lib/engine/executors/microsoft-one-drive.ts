import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, sdkHttpRequest } from "@/sdk";
import { evaluateExpression } from "@/lib/expressions/evaluate";

const API_BASE = "https://graph.microsoft.com/v1.0/me/drive";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const microsoftOneDriveExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];

  const resource = (node.parameters.resource as string) ?? "file";
  const operation = (node.parameters.operation as string) ?? "get";
  const continueOnFail = ctx.continueOnFail();

  const headers = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, headers, item, idx, out);
      if (result !== undefined) {
        if (Array.isArray(result)) {
          for (const r of result) {
            out.push({ json: r as Record<string, unknown>, pairedItem: { item: idx, input: 0 } });
          }
        } else {
          out.push({ json: result as Record<string, unknown>, pairedItem });
        }
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out];
};

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const credNames = ["microsoftOneDriveOAuth2Api", "microsoftOAuth2Api", "microsoftEntraServicePrincipal"];
  let cred = null;
  for (const name of credNames) {
    cred = await ctx.getCredential(name);
    if (cred) break;
  }
  if (!cred) {
    throw new Error("Microsoft OneDrive: a Microsoft credential is required");
  }
  return {
    Authorization: `Bearer ${String(cred.accessToken ?? "")}`,
    "Content-Type": "application/json",
  };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  item: INodeExecutionData,
  idx: number,
  out: INodeExecutionData[],
): Promise<Record<string, unknown> | Record<string, unknown>[] | undefined> {
  switch (resource) {
    case "file":
      return runFileOperation(ctx, node, operation, itemJson, headers, item, idx, out);
    case "folder":
      return runFolderOperation(ctx, node, operation, itemJson, headers, item);
    default:
      throw new Error(`Microsoft OneDrive: unknown resource "${resource}"`);
  }
}

async function runFileOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  item: INodeExecutionData,
  idx: number,
  out: INodeExecutionData[],
): Promise<Record<string, unknown> | Record<string, unknown>[] | undefined> {
  switch (operation) {
    case "get":
      return fileGet(node, itemJson, headers);
    case "download":
      return fileDownload(ctx, node, itemJson, headers, item, idx, out);
    case "delete":
      return fileDelete(node, itemJson, headers);
    case "rename":
      return fileRename(node, itemJson, headers);
    case "copy":
      return fileCopy(node, itemJson, headers);
    case "search":
      return fileSearch(node, itemJson, headers);
    case "share":
      return fileShare(ctx, node, itemJson, headers);
    case "upload":
      return fileUpload(ctx, node, itemJson, headers, item, idx);
    default:
      throw new Error(`Microsoft OneDrive: unknown file operation "${operation}"`);
  }
}

async function runFolderOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  item: INodeExecutionData,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (operation) {
    case "create":
      return folderCreate(node, itemJson, headers);
    case "delete":
      return folderDelete(node, itemJson, headers);
    case "getAll":
      return folderGetAll(node, itemJson, headers);
    case "rename":
      return folderRename(node, itemJson, headers);
    case "search":
      return folderSearch(node, itemJson, headers);
    case "share":
      return folderShare(ctx, node, itemJson, headers);
    default:
      throw new Error(`Microsoft OneDrive: unknown folder operation "${operation}"`);
  }
}

function getFileId(node: INode, itemJson: Record<string, unknown>): string {
  return String(resolveValue(node.parameters.fileId, itemJson) ?? "");
}

function getFolderId(node: INode, itemJson: Record<string, unknown>): string {
  return String(resolveValue(node.parameters.folderId, itemJson) ?? "");
}

async function graphRequest(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const res = await sdkHttpRequest({ method, url, headers, body, timeoutMs: 30000 });
  if (res.status < 200 || res.status >= 300) {
    const errMsg = res.body && typeof res.body === "object" ? (res.body as Record<string, unknown>).error ?? res.status : String(res.status);
    throw new Error(`Microsoft OneDrive: HTTP ${res.status} - ${String(errMsg)}`);
  }
  return (res.body as Record<string, unknown>) ?? {};
}

async function fileGet(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const fileId = getFileId(node, itemJson);
  if (!fileId) throw new Error("Microsoft OneDrive: fileId is required");
  return graphRequest("GET", `${API_BASE}/items/${fileId}`, headers);
}

async function fileDownload(ctx: ExecutionContext, node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>, item: INodeExecutionData, idx: number, out: INodeExecutionData[]): Promise<undefined> {
  const fileId = getFileId(node, itemJson);
  if (!fileId) throw new Error("Microsoft OneDrive: fileId is required");
  const metadata = await graphRequest("GET", `${API_BASE}/items/${fileId}`, headers);
  const binaryPropertyName = String(resolveValue(node.parameters.binaryPropertyName, itemJson) ?? "data");
  const contentRes = await sdkHttpRequest({ method: "GET", url: `${API_BASE}/items/${fileId}/content`, headers, timeoutMs: 30000 });
  const contentText = typeof contentRes.body === "string" ? contentRes.body : contentRes.body ? JSON.stringify(contentRes.body) : "";
  const binaryData = Buffer.from(contentText).toString("base64");
  const fileName = (metadata.name as string) ?? "download";
  const mimeType = ((metadata.file as Record<string, unknown> | undefined)?.mimeType as string) ?? "application/octet-stream";
  const fileExtension = fileName.includes(".") ? fileName.split(".").pop() ?? "" : "";
  out.push({
    json: metadata,
    binary: {
      [binaryPropertyName]: {
        data: binaryData,
        mimeType,
        fileName,
        fileExtension,
        fileSize: contentText.length,
      },
    },
    pairedItem: { item: idx, input: 0 },
  });
}

async function fileDelete(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const fileId = getFileId(node, itemJson);
  if (!fileId) throw new Error("Microsoft OneDrive: fileId is required");
  await graphRequest("DELETE", `${API_BASE}/items/${fileId}`, headers);
  return itemJson;
}

async function fileRename(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const fileId = getFileId(node, itemJson);
  if (!fileId) throw new Error("Microsoft OneDrive: fileId is required");
  const newName = String(resolveValue(node.parameters.newName, itemJson) ?? "");
  if (!newName) throw new Error("Microsoft OneDrive: newName is required for rename");
  return graphRequest("PATCH", `${API_BASE}/items/${fileId}`, headers, { name: newName });
}

async function fileCopy(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const fileId = getFileId(node, itemJson);
  if (!fileId) throw new Error("Microsoft OneDrive: fileId is required");
  const destFolder = String(resolveValue(node.parameters.destinationFolder, itemJson) ?? "");
  const copyNewName = String(resolveValue(node.parameters.copyNewName, itemJson) ?? "");
  const body: Record<string, unknown> = {};
  if (destFolder) {
    body.parentReference = { id: destFolder };
  }
  if (copyNewName) {
    body.name = copyNewName;
  }
  const res = await sdkHttpRequest({ method: "POST", url: `${API_BASE}/items/${fileId}/copy`, headers, body, timeoutMs: 30000 });
  if (res.status === 202) {
    if (res.body && typeof res.body === "object" && Object.keys(res.body as Record<string, unknown>).length > 0) {
      return res.body as Record<string, unknown>;
    }
    const locationUrl = res.headers["location"] ?? "";
    if (locationUrl) {
      const pollResult = await pollCopyMonitor(locationUrl, headers);
      return pollResult;
    }
    return { id: fileId, name: copyNewName || "copied", status: "async" };
  }
  if (res.status < 200 || res.status >= 300) {
    const errMsg = res.body && typeof res.body === "object" ? (res.body as Record<string, unknown>).error ?? res.status : String(res.status);
    throw new Error(`Microsoft OneDrive: HTTP ${res.status} - ${String(errMsg)}`);
  }
  return (res.body as Record<string, unknown>) ?? {};
}

async function pollCopyMonitor(locationUrl: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const maxRetries = 10;
  const delayMs = 2000;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const res = await sdkHttpRequest({ method: "GET", url: locationUrl, headers, timeoutMs: 30000 });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Microsoft OneDrive: copy monitor failed HTTP ${res.status}`);
    }
    const body = res.body as Record<string, unknown> ?? {};
    const status = body.status as string ?? "";
    if (status === "completed" || status === "done") {
      const resourceId = body.resourceId as string ?? body.id as string ?? "";
      const location = body.resourceLocation as string ?? "";
      if (resourceId && location) {
        try {
          return await graphRequest("GET", location, headers);
        } catch {
          return { id: resourceId, status: "completed" };
        }
      }
      return { id: resourceId, status: "completed" };
    }
    if (status === "failed" || status === "error") {
      throw new Error(`Microsoft OneDrive: copy failed - ${JSON.stringify(body.error ?? body)}`);
    }
  }
  throw new Error("Microsoft OneDrive: copy monitor timed out");
}

async function fileSearch(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>[]> {
  const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
  if (!query) throw new Error("Microsoft OneDrive: query is required");
  const res = await graphRequest("GET", `${API_BASE}/root/search(q='${encodeURIComponent(query)}')`, headers);
  const value = res.value as Record<string, unknown>[] | undefined;
  return value ?? [];
}

async function fileShare(ctx: ExecutionContext, node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const fileId = getFileId(node, itemJson);
  if (!fileId) throw new Error("Microsoft OneDrive: fileId is required");
  const permissions = String(resolveValue(node.parameters.permissions, itemJson) ?? "read");
  const requireSignIn = node.parameters.requireSignIn === true;
  const recipientEmail = String(resolveValue(node.parameters.recipientEmail, itemJson) ?? "");
  if (recipientEmail) {
    const inviteBody: Record<string, unknown> = {
      recipients: [{ email: recipientEmail }],
      message: String(resolveValue(node.parameters.message, itemJson) ?? ""),
      requireSignIn,
      sendInvitation: node.parameters.sendEmail !== false,
      roles: [permissions],
    };
    const sendEmail = node.parameters.sendEmail !== false;
    inviteBody.sendInvitation = sendEmail;
    return graphRequest("POST", `${API_BASE}/items/${fileId}/invite`, headers, {
      recipients: [{ email: recipientEmail }],
      message: String(resolveValue(node.parameters.message, itemJson) ?? ""),
      requireSignIn,
      sendInvitation: sendEmail,
      roles: [permissions],
    });
  }
  const linkType = permissions === "read" ? "view" : permissions === "readWrite" ? "edit" : "edit";
  const scope = requireSignIn ? "organization" : "anonymous";
  return graphRequest("POST", `${API_BASE}/items/${fileId}/createLink`, headers, { type: linkType, scope });
}

async function fileUpload(ctx: ExecutionContext, node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>, item: INodeExecutionData, idx: number): Promise<Record<string, unknown>> {
  const parentFolder = String(resolveValue(node.parameters.parentFolder, itemJson) ?? "");
  const fileName = String(resolveValue(node.parameters.fileName, itemJson) ?? "");
  if (!fileName) throw new Error("Microsoft OneDrive: fileName is required");
  const binaryPropertyName = String(resolveValue(node.parameters.binaryPropertyName, itemJson) ?? "data");
  const bin = item.binary?.[binaryPropertyName];
  if (!bin) {
    throw new Error(`Microsoft OneDrive: binary property "${binaryPropertyName}" not found on item ${idx}`);
  }
  const fileBuffer = Buffer.from(bin.data, "base64");
  if (fileBuffer.length > 4 * 1024 * 1024) {
    throw new Error(`Microsoft OneDrive: file size exceeds 4MB limit (${fileBuffer.length} bytes)`);
  }
  const parentPath = parentFolder ? `/${parentFolder}` : "/root";
  const uploadUrl = `${API_BASE}${parentPath}:/${fileName}:/content`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": bin.mimeType ?? "application/octet-stream" },
      body: fileBuffer,
      signal: controller.signal,
    });
    const text = await res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Microsoft OneDrive: upload failed HTTP ${res.status} - ${text.slice(0, 200)}`);
    }
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch { /* keep empty */ }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function folderCreate(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const folderName = String(resolveValue(node.parameters.folderName, itemJson) ?? "");
  if (!folderName) throw new Error("Microsoft OneDrive: folderName is required");
  const folderId = String(resolveValue(node.parameters.folderId, itemJson) ?? "");
  const url = folderId ? `${API_BASE}/items/${folderId}/children` : `${API_BASE}/root/children`;
  return graphRequest("POST", url, headers, { name: folderName, folder: {} });
}

async function folderDelete(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const folderId = getFolderId(node, itemJson);
  if (!folderId) throw new Error("Microsoft OneDrive: folderId is required");
  await graphRequest("DELETE", `${API_BASE}/items/${folderId}`, headers);
  return itemJson;
}

async function folderGetAll(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>[]> {
  const folderId = getFolderId(node, itemJson);
  if (!folderId) throw new Error("Microsoft OneDrive: folderId is required");
  const res = await graphRequest("GET", `${API_BASE}/items/${folderId}/children`, headers);
  return (res.value as Record<string, unknown>[]) ?? [];
}

async function folderRename(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const folderId = getFolderId(node, itemJson);
  if (!folderId) throw new Error("Microsoft OneDrive: folderId is required");
  const newName = String(resolveValue(node.parameters.newName, itemJson) ?? "");
  if (!newName) throw new Error("Microsoft OneDrive: newName is required for rename");
  return graphRequest("PATCH", `${API_BASE}/items/${folderId}`, headers, { name: newName });
}

async function folderSearch(node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>[]> {
  const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
  if (!query) throw new Error("Microsoft OneDrive: query is required");
  const res = await graphRequest("GET", `${API_BASE}/root/search(q='${encodeURIComponent(query)}')`, headers);
  return (res.value as Record<string, unknown>[]) ?? [];
}

async function folderShare(ctx: ExecutionContext, node: INode, itemJson: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const folderId = getFolderId(node, itemJson);
  if (!folderId) throw new Error("Microsoft OneDrive: folderId is required");
  const permissions = String(resolveValue(node.parameters.permissions, itemJson) ?? "read");
  const requireSignIn = node.parameters.requireSignIn === true;
  const recipientEmail = String(resolveValue(node.parameters.recipientEmail, itemJson) ?? "");
  if (recipientEmail) {
    return graphRequest("POST", `${API_BASE}/items/${folderId}/invite`, headers, {
      recipients: [{ email: recipientEmail }],
      message: String(resolveValue(node.parameters.message, itemJson) ?? ""),
      requireSignIn,
      sendInvitation: node.parameters.sendEmail !== false,
      roles: [permissions],
    });
  }
  const linkType = permissions === "read" ? "view" : "edit";
  const scope = requireSignIn ? "organization" : "anonymous";
  return graphRequest("POST", `${API_BASE}/items/${folderId}/createLink`, headers, { type: linkType, scope });
}