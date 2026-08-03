import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_DRIVE_API = "https://www.googleapis.com/drive/v3/drives";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function resolveParent(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): string {
  const p = resolveValue(params.parentId, itemJson);
  if (p && typeof p === "string") return p;
  const f = resolveValue(params.folderId, itemJson);
  if (f && typeof f === "string") return String(f);
  const d = resolveValue(params.driveId, itemJson);
  if (d && typeof d === "string") return String(d);
  return "";
}

function resolvePermissions(
  raw: unknown,
  itemJson: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const r = resolveValue(raw, itemJson);
  if (Array.isArray(r)) return r as Array<Record<string, unknown>>;
  if (r && typeof r === "object") {
    const obj = r as Record<string, unknown>;
    const vals = obj.permissionValues;
    if (Array.isArray(vals)) return vals as Array<Record<string, unknown>>;
    if (Array.isArray(obj.values)) return obj.values as Array<Record<string, unknown>>;
  }
  if (typeof r === "string") {
    try {
      const parsed = JSON.parse(r);
      if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    } catch { /* keep */ }
  }
  return [];
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleDriveOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleDriveTool: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleDriveTool: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleDriveTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

async function uploadBinary(
  method: string,
  url: string,
  token: string,
  fileName: string,
  binaryData: { data: string; mimeType: string },
  parentId: string,
): Promise<Record<string, unknown>> {
  const boundary = "openflow_boundary_" + Date.now();
  const mimeType = binaryData.mimeType || "application/octet-stream";
  const body_parts: string[] = [];

  const metadata: Record<string, unknown> = { name: fileName };
  if (parentId) {
    metadata.parents = [parentId];
  }

  body_parts.push("--" + boundary);
  body_parts.push("Content-Type: application/json; charset=UTF-8");
  body_parts.push("");
  body_parts.push(JSON.stringify(metadata));

  body_parts.push("--" + boundary);
  body_parts.push("Content-Type: " + mimeType);
  body_parts.push("");
  body_parts.push(binaryData.data);

  body_parts.push("--" + boundary + "--");

  const requestBody = body_parts.join("\r\n");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": `multipart/related; boundary=${boundary}`,
    "Content-Length": String(new TextEncoder().encode(requestBody).length),
  };
  const init: RequestInit = { method, headers, body: requestBody };
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleDriveTool: ${msg}`);
  }
  return asObj(parsed);
}

async function paginate(
  url: string,
  token: string,
  params: Record<string, string>,
  returnAll: boolean,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  const pageSize = returnAll ? 100 : Math.min(Math.max(limit, 1), 100);
  for (;;) {
    const qs = new URLSearchParams({ ...params, pageSize: String(pageSize) });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await apiRequest("GET", `${url}?${qs}`, token);
    const obj = asObj(res.body);
    const files = (obj.files as Record<string, unknown>[]) ?? [];
    all.push(...files);
    if (!returnAll && all.length >= limit) return all.slice(0, limit);
    const next = obj.nextPageToken;
    if (typeof next !== "string" || !next) break;
    pageToken = next;
  }
  return all;
}

export const googleDriveToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "file") ?? "file");
  const operation = String(
    node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create",
  );
  const continueOnFail = ctx.continueOnFail();
  const token = await getAccessToken(ctx, node);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(resource, operation, node.parameters, itemJson, token, item);
      for (const json of results) {
        out.push({ json, pairedItem });
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
  resource: string,
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
  item: INodeExecutionData,
): Promise<Record<string, unknown>[]> {
  if (resource === "file") {
    return runFileOperation(operation, params, itemJson, token, item);
  }
  if (resource === "fileFolder") {
    return runFileFolderOperation(params, operation, itemJson, token);
  }
  if (resource === "folder") {
    return runFolderOperation(params, operation, itemJson, token);
  }
  if (resource === "drive") {
    return runDriveOperation(params, operation, itemJson, token);
  }
  throw new Error(`GoogleDriveTool: unsupported resource "${resource}"`);
}

async function runFileOperation(
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
  item: INodeExecutionData,
): Promise<Record<string, unknown>[]> {
  switch (operation) {
    case "copy":
      return fileCopy(params, itemJson, token);
    case "create":
      return fileCreate(params, itemJson, token);
    case "delete":
      return fileDelete(params, itemJson, token);
    case "download":
      return fileDownload(params, itemJson, token);
    case "move":
      return fileMove(params, itemJson, token);
    case "share":
      return fileShare(params, itemJson, token);
    case "update":
      return fileUpdate(params, itemJson, token, item);
    case "upload":
      return fileUpload(params, itemJson, token, item);
    default:
      throw new Error(`GoogleDriveTool: unsupported file operation "${operation}"`);
  }
}

async function fileCopy(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const fileId = String(resolveValue(params.fileId, itemJson) ?? "");
  if (!fileId) throw new Error("GoogleDriveTool: fileId is required for copy");
  const newName = String(resolveValue(params.newName, itemJson) ?? "");
  const body: Record<string, unknown> = {};
  if (newName) body.name = newName;
  const copyInSameFolder = params.copyInSameFolder !== false;
  const parent = resolveParent(params, itemJson);
  if (!copyInSameFolder && parent) {
    body.parents = [parent];
  }
  const res = await apiRequest("POST", `${DRIVE_API}/${encodeURIComponent(fileId)}/copy`, token, body);
  const obj = asObj(res.body);
  return [
    {
      id: obj.id,
      name: obj.name,
      mimeType: obj.mimeType,
      parents: obj.parents,
      webViewLink: obj.webViewLink,
    },
  ];
}

async function fileCreate(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const fileName = String(resolveValue(params.fileName, itemJson) ?? "untitled");
  const content = String(resolveValue(params.content, itemJson) ?? "");
  const convertToGoogleDocument = params.convertToGoogleDocument === true;
  const parent = resolveParent(params, itemJson);

  const metadata: Record<string, unknown> = { name: fileName };
  if (parent) metadata.parents = [parent];
  if (convertToGoogleDocument) {
    metadata.mimeType = "application/vnd.google-apps.document";
  }

  const body = {
    ...metadata,
    ...(content ? { content } : {}),
  };

  const res = await apiRequest("POST", `${DRIVE_API}`, token, body);
  const obj = asObj(res.body);
  return [
    {
      id: obj.id,
      name: obj.name,
      mimeType: obj.mimeType,
      parents: obj.parents,
      webViewLink: obj.webViewLink,
    },
  ];
}

async function fileDelete(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const fileId = String(resolveValue(params.fileId, itemJson) ?? "");
  if (!fileId) throw new Error("GoogleDriveTool: fileId is required for delete");
  const deletePermanently = params.deletePermanently === true;

  if (deletePermanently) {
    await apiRequest("DELETE", `${DRIVE_API}/${encodeURIComponent(fileId)}`, token);
    return [{ id: fileId, deleted: true, permanent: true }];
  }
  await apiRequest(
    "PATCH",
    `${DRIVE_API}/${encodeURIComponent(fileId)}`,
    token,
    { trashed: true },
  );
  return [{ id: fileId, deleted: true, permanent: false, trashed: true }];
}

async function fileDownload(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const fileId = String(resolveValue(params.fileId, itemJson) ?? "");
  if (!fileId) throw new Error("GoogleDriveTool: fileId is required for download");
  const outputField = String(resolveValue(params.outputField, itemJson) ?? "data");

  let url = `${DRIVE_API}/${encodeURIComponent(fileId)}`;
  const convertTo = String(resolveValue(params.convertTo, itemJson) ?? "");
  if (convertTo) {
    url += `/export?mimeType=${encodeURIComponent(convertTo)}`;
  } else {
    url += "?alt=media";
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GoogleDriveTool: download failed (HTTP ${res.status}): ${text}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const metaRes = await apiRequest(
    "GET",
    `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,parents`,
    token,
  );
  const meta = asObj(metaRes.body);

  const out: Record<string, unknown> = {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    parents: meta.parents,
    webViewLink: meta.webViewLink,
  };
  (out as Record<string, unknown>).binary = {
    [outputField]: {
      data: base64,
      mimeType: convertTo || String(meta.mimeType ?? "application/octet-stream"),
      fileName: String(meta.name ?? "download"),
    },
  };
  return [out];
}

async function fileMove(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const fileId = String(resolveValue(params.fileId, itemJson) ?? "");
  if (!fileId) throw new Error("GoogleDriveTool: fileId is required for move");
  const parentId = resolveParent(params, itemJson);
  if (!parentId) throw new Error("GoogleDriveTool: parentId is required for move");

  const metaRes = await apiRequest(
    "GET",
    `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=parents`,
    token,
  );
  const meta = asObj(metaRes.body);
  const currentParents = (meta.parents as string[]) ?? [];

  const removeParents = currentParents.join(",");
  const addParents = parentId;

  const res = await apiRequest(
    "PATCH",
    `${DRIVE_API}/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(addParents)}&removeParents=${encodeURIComponent(removeParents)}&fields=id,name,mimeType,parents,webViewLink`,
    token,
  );
  const obj = asObj(res.body);
  return [
    {
      id: obj.id,
      name: obj.name,
      mimeType: obj.mimeType,
      parents: obj.parents,
      webViewLink: obj.webViewLink,
    },
  ];
}

async function fileShare(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const fileId = String(resolveValue(params.fileId, itemJson) ?? "");
  if (!fileId) throw new Error("GoogleDriveTool: fileId is required for share");
  const permissions = resolvePermissions(params.permissions, itemJson);
  if (permissions.length === 0) throw new Error("GoogleDriveTool: permissions is required for share");

  const results: Record<string, unknown>[] = [];
  for (const perm of permissions) {
    const body: Record<string, unknown> = {
      role: perm.role ?? "reader",
      type: perm.type ?? "user",
    };
    if (perm.email) body.emailAddress = String(perm.email);
    if (perm.domain) body.domain = String(perm.domain);
    const res = await apiRequest(
      "POST",
      `${DRIVE_API}/${encodeURIComponent(fileId)}/permissions`,
      token,
      body,
    );
    const obj = asObj(res.body);
    results.push({
      id: obj.id,
      role: obj.role,
      type: obj.type,
      emailAddress: obj.emailAddress,
      domain: obj.domain,
    });
  }
  return results;
}

async function fileUpdate(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
  item: INodeExecutionData,
): Promise<Record<string, unknown>[]> {
  const fileId = String(resolveValue(params.fileId, itemJson) ?? "");
  if (!fileId) throw new Error("GoogleDriveTool: fileId is required for update");

  const moveToTrash = params.moveToTrash === true;
  if (moveToTrash) {
    await apiRequest(
      "PATCH",
      `${DRIVE_API}/${encodeURIComponent(fileId)}`,
      token,
      { trashed: true },
    );
    return [{ id: fileId, trashed: true }];
  }

  const body: Record<string, unknown> = {};
  const newFileName = String(resolveValue(params.newFileName, itemJson) ?? "");
  if (newFileName) body.name = newFileName;

  const changeFileContent = params.changeFileContent === true;
  if (changeFileContent) {
    const binaryField = String(resolveValue(params.binaryField, itemJson) ?? "data");
    const binary = item.binary?.[binaryField];
    if (!binary) throw new Error(`GoogleDriveTool: binary field "${binaryField}" not found on input item`);
    const boundary = "openflow_boundary_" + Date.now();
    const mimeType = binary.mimeType || "application/octet-stream";
    const bodyParts: string[] = [];

    bodyParts.push("--" + boundary);
    bodyParts.push("Content-Type: application/json; charset=UTF-8");
    bodyParts.push("");
    bodyParts.push(JSON.stringify(body));

    bodyParts.push("--" + boundary);
    bodyParts.push("Content-Type: " + mimeType);
    bodyParts.push("");
    bodyParts.push(binary.data);

    bodyParts.push("--" + boundary + "--");

    const uploadBody = bodyParts.join("\r\n");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(new TextEncoder().encode(uploadBody).length),
    };
    const init: RequestInit = { method: "PATCH", headers, body: uploadBody };
    const res = await fetch(
      `${UPLOAD_API}/${encodeURIComponent(fileId)}?uploadType=multipart`,
      init,
    );
    const text = await res.text();
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (res.status < 200 || res.status >= 300) {
      const errObj = asObj(parsed);
      const msg =
        (errObj.error as { message?: string } | undefined)?.message ??
        String(errObj.message ?? `HTTP ${res.status}`);
      throw new Error(`GoogleDriveTool: ${msg}`);
    }
    const obj = asObj(parsed);
    return [
      {
        id: obj.id,
        name: obj.name,
        mimeType: obj.mimeType,
        parents: obj.parents,
        webViewLink: obj.webViewLink,
      },
    ];
  }

  const res = await apiRequest(
    "PATCH",
    `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,webViewLink`,
    token,
    body,
  );
  const obj = asObj(res.body);
  return [
    {
      id: obj.id,
      name: obj.name,
      mimeType: obj.mimeType,
      parents: obj.parents,
      webViewLink: obj.webViewLink,
    },
  ];
}

async function fileUpload(
  params: Record<string, unknown>,
  _itemJson: Record<string, unknown>,
  token: string,
  item: INodeExecutionData,
): Promise<Record<string, unknown>[]> {
  const binaryField = String(resolveValue(params.binaryField, _itemJson) ?? "data");
  const binary = item.binary?.[binaryField];
  if (!binary) throw new Error(`GoogleDriveTool: binary field "${binaryField}" not found on input item`);
  const fileName = String(resolveValue(params.fileName, _itemJson) ?? binary.fileName ?? "untitled");
  const parent = resolveParent(params, _itemJson);
  const qs = "?uploadType=multipart&fields=id,name,mimeType,parents,webViewLink";
  const obj = await uploadBinary("POST", `${UPLOAD_API}${qs}`, token, fileName, binary, parent);
  return [
    {
      id: obj.id,
      name: obj.name,
      mimeType: obj.mimeType,
      parents: obj.parents,
      webViewLink: obj.webViewLink,
    },
  ];
}

async function runFileFolderOperation(
  params: Record<string, unknown>,
  operation: string,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  if (operation !== "search") {
    throw new Error(`GoogleDriveTool: unsupported fileFolder operation "${operation}"`);
  }
  return fileFolderSearch(params, itemJson, token);
}

async function fileFolderSearch(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const searchMode = String(resolveValue(params.searchMode, itemJson) ?? "name");
  const query = String(resolveValue(params.query, itemJson) ?? "");
  const returnAll = params.returnAll === true;
  const limit = Number(params.limit ?? 50);
  const includeTrashed = params.includeTrashed === true;
  const parent = resolveParent(params, itemJson);

  const qParts: string[] = [];
  if (searchMode === "name") {
    qParts.push(`name contains '${query.replace(/'/g, "\\'")}'`);
  } else {
    qParts.push(query);
  }
  if (!includeTrashed) {
    qParts.push("trashed = false");
  }
  if (parent) {
    qParts.push(`'${parent}' in parents`);
  }

  const q = qParts.join(" and ");
  const params_qs: Record<string, string> = { q };
  const results = await paginate(
    `${DRIVE_API}`,
    token,
    params_qs,
    returnAll,
    limit,
  );
  return results.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    parents: f.parents,
    webViewLink: f.webViewLink,
    trashed: f.trashed,
    modifiedTime: f.modifiedTime,
    size: f.size,
  }));
}

async function runFolderOperation(
  params: Record<string, unknown>,
  operation: string,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  switch (operation) {
    case "create":
      return folderCreate(params, itemJson, token);
    case "delete":
      return folderDelete(params, itemJson, token);
    case "share":
      return folderShare(params, itemJson, token);
    default:
      throw new Error(`GoogleDriveTool: unsupported folder operation "${operation}"`);
  }
}

async function folderCreate(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const folderName = String(resolveValue(params.folderName, itemJson) ?? "");
  if (!folderName) throw new Error("GoogleDriveTool: folderName is required for folder create");
  const parent = resolveParent(params, itemJson);
  const metadata: Record<string, unknown> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parent) metadata.parents = [parent];
  const res = await apiRequest("POST", DRIVE_API, token, metadata);
  const obj = asObj(res.body);
  return [
    {
      id: obj.id,
      name: obj.name,
      mimeType: obj.mimeType,
      parents: obj.parents,
    },
  ];
}

async function folderDelete(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const folderId = String(resolveValue(params.folderId, itemJson) ?? "");
  if (!folderId) throw new Error("GoogleDriveTool: folderId is required for folder delete");
  const deletePermanently = params.deletePermanently === true;
  if (deletePermanently) {
    await apiRequest("DELETE", `${DRIVE_API}/${encodeURIComponent(folderId)}`, token);
    return [{ id: folderId, deleted: true, permanent: true }];
  }
  await apiRequest(
    "PATCH",
    `${DRIVE_API}/${encodeURIComponent(folderId)}`,
    token,
    { trashed: true },
  );
  return [{ id: folderId, deleted: true, permanent: false, trashed: true }];
}

async function folderShare(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const folderId = String(resolveValue(params.folderId, itemJson) ?? "");
  if (!folderId) throw new Error("GoogleDriveTool: folderId is required for folder share");
  const permissions = resolvePermissions(params.permissions, itemJson);
  if (permissions.length === 0) throw new Error("GoogleDriveTool: permissions is required for folder share");

  const results: Record<string, unknown>[] = [];
  for (const perm of permissions) {
    const body: Record<string, unknown> = {
      role: perm.role ?? "reader",
      type: perm.type ?? "user",
    };
    if (perm.email) body.emailAddress = String(perm.email);
    if (perm.domain) body.domain = String(perm.domain);
    const res = await apiRequest(
      "POST",
      `${DRIVE_API}/${encodeURIComponent(folderId)}/permissions`,
      token,
      body,
    );
    const obj = asObj(res.body);
    results.push({
      id: obj.id,
      role: obj.role,
      type: obj.type,
      emailAddress: obj.emailAddress,
      domain: obj.domain,
    });
  }
  return results;
}

async function runDriveOperation(
  params: Record<string, unknown>,
  operation: string,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  switch (operation) {
    case "create":
      return driveCreate(params, itemJson, token);
    case "delete":
      return driveDelete(params, itemJson, token);
    case "get":
      return driveGet(params, itemJson, token);
    case "getAll":
      return driveGetAll(params, itemJson, token);
    case "update":
      return driveUpdate(params, itemJson, token);
    default:
      throw new Error(`GoogleDriveTool: unsupported drive operation "${operation}"`);
  }
}

async function driveCreate(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const name = String(resolveValue(params.name ?? params.driveName, itemJson) ?? "");
  if (!name) throw new Error("GoogleDriveTool: name is required for drive create");
  const body: Record<string, unknown> = { name };
  if (params.restrictions) body.restrictions = params.restrictions;
  if (params.capabilities) body.capabilities = params.capabilities;
  if (params.color) body.colorRgb = String(params.color);
  if (params.hidden !== undefined) body.hidden = params.hidden;

  const res = await apiRequest("POST", DRIVE_DRIVE_API + "?useDomainAdminAccess=false", token, body);
  const obj = asObj(res.body);
  return [{ id: obj.id, name: obj.name, kind: obj.kind }];
}

async function driveDelete(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const driveId = String(resolveValue(params.driveId, itemJson) ?? "");
  if (!driveId) throw new Error("GoogleDriveTool: driveId is required for drive delete");
  await apiRequest("DELETE", `${DRIVE_DRIVE_API}/${encodeURIComponent(driveId)}`, token);
  return [{ id: driveId, deleted: true }];
}

async function driveGet(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const driveId = String(resolveValue(params.driveId, itemJson) ?? "");
  if (!driveId) throw new Error("GoogleDriveTool: driveId is required for drive get");
  const res = await apiRequest(
    "GET",
    `${DRIVE_DRIVE_API}/${encodeURIComponent(driveId)}?useDomainAdminAccess=false`,
    token,
  );
  const obj = asObj(res.body);
  return [
    {
      id: obj.id,
      name: obj.name,
      kind: obj.kind,
      createdTime: obj.createdTime,
      restrictions: obj.restrictions,
      capabilities: obj.capabilities,
    },
  ];
}

async function driveGetAll(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = params.returnAll === true;
  const limit = Number(params.limit ?? 50);
  const query = String(resolveValue(params.query, itemJson) ?? "");
  const qsParams: Record<string, string> = {
    useDomainAdminAccess: "false",
  };
  if (query) qsParams.q = query;

  const all: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  const pageSize = returnAll ? 100 : Math.min(Math.max(limit, 1), 100);
  for (;;) {
    const qs = new URLSearchParams({ ...qsParams, pageSize: String(pageSize) });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await apiRequest("GET", `${DRIVE_DRIVE_API}?${qs}`, token);
    const obj = asObj(res.body);
    const drives = (obj.drives as Record<string, unknown>[]) ?? [];
    all.push(...drives.map((d) => ({ id: d.id, name: d.name, kind: d.kind })));
    if (!returnAll && all.length >= limit) return all.slice(0, limit);
    const next = obj.nextPageToken;
    if (typeof next !== "string" || !next) break;
    pageToken = next;
  }
  return all;
}

async function driveUpdate(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const driveId = String(resolveValue(params.driveId, itemJson) ?? "");
  if (!driveId) throw new Error("GoogleDriveTool: driveId is required for drive update");
  const body: Record<string, unknown> = {};
  const name = resolveValue(params.name ?? params.driveName, itemJson);
  if (name && typeof name === "string") body.name = name;
  if (params.color) body.colorRgb = String(params.color);
  if (params.restrictions) body.restrictions = params.restrictions;
  const res = await apiRequest(
    "PATCH",
    `${DRIVE_DRIVE_API}/${encodeURIComponent(driveId)}?useDomainAdminAccess=false`,
    token,
    body,
  );
  const obj = asObj(res.body);
  return [
    {
      id: obj.id,
      name: obj.name,
      kind: obj.kind,
      restrictions: obj.restrictions,
    },
  ];
}
