import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.box.com/2.0";

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("boxOAuth2Api");
  const token = cred
    ? String(
        (cred as Record<string, unknown>).accessToken ??
          (cred as Record<string, unknown>).access_token ??
          "",
      )
    : "";
  if (!token) {
    throw new Error("Box: credential is not configured");
  }
  return token;
}

async function boxApi(
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const errObj =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    throw new Error(
      `Box API error: ${(errObj.message as string) ?? (errObj.error_description as string) ?? res.statusText}`,
    );
  }
  return (parsed ?? {}) as Record<string, unknown>;
}

async function boxUpload(
  token: string,
  fileName: string,
  parentId: string,
  content: string,
): Promise<Record<string, unknown>> {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const bodyParts: string[] = [];
  bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="attributes"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: fileName, parent: { id: parentId } })}\r\n`);
  bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n`);
  bodyParts.push(`--${boundary}--`);
  const res = await fetch("https://upload.box.com/api/2.0/files/content", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: bodyParts.join(""),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    throw new Error(`Box upload error: ${res.statusText}`);
  }
  const entries =
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return entries as Record<string, unknown>;
}

async function boxDownload(
  token: string,
  fileId: string,
): Promise<{ metadata: Record<string, unknown>; content?: string }> {
  const res = await fetch(`${API_BASE}/files/${fileId}/content`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Box download error: ${res.statusText}`);
  }
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(res.headers.get("Box-API-Result") ?? "{}");
  } catch {
    /* ok */
  }
  return { metadata, content: text };
}

export const boxExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "file");
  const operation = String(node.parameters.operation ?? "upload");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, item);
      if (resource === "file" && operation === "download") {
        const { json, binary } = result as { json: Record<string, unknown>; binary?: Record<string, unknown> };
        out.push({ json, binary: binary ?? undefined, pairedItem });
      } else {
        const list = Array.isArray(result) ? result : [result];
        for (const r of list) {
          out.push({ json: r, pairedItem });
        }
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

function resolveValue(raw: unknown, _itemJson: Record<string, unknown>): string {
  if (raw == null) return "";
  return String(raw);
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  item: INodeExecutionData,
): Promise<Record<string, unknown> | Record<string, unknown>[] | { json: Record<string, unknown>; binary: Record<string, unknown> }> {
  const token = await getToken(ctx);
  const itemJson = item.json ?? {};

  if (resource === "file") {
    if (operation === "upload") return runFileUpload(token, node, itemJson, item);
    if (operation === "download") return runFileDownload(token, node, itemJson);
    if (operation === "copy") return runFileCopy(token, node, itemJson);
    if (operation === "delete") return runFileDelete(token, node, itemJson);
    if (operation === "get") return runFileGet(token, node, itemJson);
    if (operation === "search") return runFileSearch(token, node, itemJson);
    if (operation === "share") return runFileShare(token, node, itemJson);
  }

  if (resource === "folder") {
    if (operation === "create") return runFolderCreate(token, node, itemJson);
    if (operation === "get") return runFolderGet(token, node, itemJson);
    if (operation === "delete") return runFolderDelete(token, node, itemJson);
    if (operation === "search") return runFolderSearch(token, node, itemJson);
    if (operation === "share") return runFolderShare(token, node, itemJson);
    if (operation === "update") return runFolderUpdate(token, node, itemJson);
  }

  throw new Error(`Box: unsupported resource "${resource}" / operation "${operation}"`);
}

function runFileGet(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fileId = resolveValue(node.parameters.fileId, itemJson);
  if (!fileId) throw new Error("Box: fileId is required for get");
  return boxApi(token, "GET", `/files/${fileId}`);
}

function runFileDelete(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fileId = resolveValue(node.parameters.fileId, itemJson);
  if (!fileId) throw new Error("Box: fileId is required for delete");
  return boxApi(token, "DELETE", `/files/${fileId}`).then(() => ({ success: true }));
}

function runFileCopy(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fileId = resolveValue(node.parameters.fileId, itemJson);
  const parentId = resolveValue(node.parameters.parentId, itemJson);
  const name = resolveValue(node.parameters.name, itemJson);
  if (!fileId) throw new Error("Box: fileId is required for copy");
  if (!parentId) throw new Error("Box: parentId is required for copy");
  const body: Record<string, unknown> = { parent: { id: parentId } };
  if (name) body.name = name;
  return boxApi(token, "POST", `/files/${fileId}/copy`, body);
}

async function runFileSearch(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const query = resolveValue(node.parameters.query, itemJson);
  if (!query) throw new Error("Box: query is required for search");
  const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
  const params = new URLSearchParams({ query });
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));
  if (opts.contentType) params.set("content_types", String(opts.contentType));
  if (opts.ancestorFolderId) params.set("ancestor_folder_ids", String(opts.ancestorFolderId));
  const result = await boxApi(token, "GET", `/search?${params.toString()}`);
  const entries = result.entries as Array<Record<string, unknown>> | undefined;
  return entries ?? [];
}

async function runFileShare(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fileId = resolveValue(node.parameters.fileId, itemJson);
  if (!fileId) throw new Error("Box: fileId is required for share");
  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const sharedLink: Record<string, unknown> = {};
  if (additionalFields.sharedLinkAccess) {
    sharedLink.access = additionalFields.sharedLinkAccess;
  }
  if (additionalFields.sharedLinkPassword) {
    sharedLink.password = additionalFields.sharedLinkPassword;
  }
  const perms = (additionalFields.sharedLinkPermissions ?? {}) as Record<string, unknown>;
  sharedLink.permissions = {
    can_download: perms.canDownload ?? true,
    can_preview: perms.canPreview ?? true,
  };
  return boxApi(token, "PUT", `/files/${fileId}`, {
    shared_link: sharedLink,
  });
}

async function runFileUpload(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const fileName = resolveValue(node.parameters.fileName, itemJson) || "untitled";
  const binaryData = node.parameters.binaryData !== false;
  let content: string;
  if (binaryData) {
    const binaryProp = resolveValue(node.parameters.binaryPropertyName, itemJson) || "data";
    const binaryEntry = (item.binary ?? {})[binaryProp] as Record<string, unknown> | undefined;
    const raw = binaryEntry?.data ?? "";
    content = typeof raw === "string" ? raw : String(raw);
  } else {
    content = resolveValue(node.parameters.fileContent, itemJson);
  }
  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const parentId = resolveValue(node.parameters.parentId, itemJson) || String(additionalFields.parentId || "0");
  const result = await boxUpload(token, fileName, parentId, content);
  const entries = result.entries as Array<Record<string, unknown>> | undefined;
  if (entries && entries.length > 0) {
    return entries[0];
  }
  return result;
}

async function runFileDownload(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown>; binary: Record<string, unknown> }> {
  const fileId = resolveValue(node.parameters.fileId, itemJson);
  if (!fileId) throw new Error("Box: fileId is required for download");
  const { content, metadata } = await boxDownload(token, fileId);
  const info = metadata?.id ? metadata : await boxApi(token, "GET", `/files/${fileId}`);
  const binaryProp = resolveValue(node.parameters.binaryPropertyName, itemJson) || "data";
  const name = String(info.name ?? fileId);
  return {
    json: info,
    binary: {
      [binaryProp]: {
        data: content ?? "",
        mimeType: (info as Record<string, string>)?.file_type ?? "application/octet-stream",
        fileName: name,
      },
    },
  };
}

function runFolderCreate(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const name = resolveValue(node.parameters.name, itemJson);
  if (!name) throw new Error("Box: name is required for create folder");
  const parentId = resolveValue(node.parameters.parentId, itemJson) || "0";
  return boxApi(token, "POST", "/folders", {
    name,
    parent: { id: parentId },
  });
}

function runFolderGet(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const folderId = resolveValue(node.parameters.folderId, itemJson);
  if (!folderId) throw new Error("Box: folderId is required for get folder");
  return boxApi(token, "GET", `/folders/${folderId}`);
}

async function runFolderDelete(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const folderId = resolveValue(node.parameters.folderId, itemJson);
  if (!folderId) throw new Error("Box: folderId is required for delete folder");
  await boxApi(token, "DELETE", `/folders/${folderId}`);
  return { success: true };
}

async function runFolderSearch(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const query = resolveValue(node.parameters.query, itemJson);
  if (!query) throw new Error("Box: query is required for search");
  const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
  const params = new URLSearchParams({ query });
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));
  if (opts.contentType) params.set("content_types", String(opts.contentType));
  const result = await boxApi(token, "GET", `/search?${params.toString()}`);
  const entries = result.entries as Array<Record<string, unknown>> | undefined;
  return entries ?? [];
}

async function runFolderShare(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const folderId = resolveValue(node.parameters.folderId, itemJson);
  if (!folderId) throw new Error("Box: folderId is required for share");
  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const sharedLink: Record<string, unknown> = {};
  if (additionalFields.sharedLinkAccess) {
    sharedLink.access = additionalFields.sharedLinkAccess;
  }
  if (additionalFields.sharedLinkPassword) {
    sharedLink.password = additionalFields.sharedLinkPassword;
  }
  const perms = (additionalFields.sharedLinkPermissions ?? {}) as Record<string, unknown>;
  sharedLink.permissions = {
    can_download: perms.canDownload ?? true,
    can_preview: perms.canPreview ?? true,
  };
  return boxApi(token, "PUT", `/folders/${folderId}`, {
    shared_link: sharedLink,
  });
}

async function runFolderUpdate(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const folderId = resolveValue(node.parameters.folderId, itemJson);
  if (!folderId) throw new Error("Box: folderId is required for update");
  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  const name = resolveValue(node.parameters.name, itemJson);
  if (name) body.name = name;
  if (additionalFields.description) body.description = additionalFields.description;
  if (additionalFields.contentCreatedAt) body.content_created_at = additionalFields.contentCreatedAt;
  if (additionalFields.contentModifiedAt) body.content_modified_at = additionalFields.contentModifiedAt;
  if (additionalFields.canNonOwnersInvite !== undefined) body.can_non_owners_invite = additionalFields.canNonOwnersInvite;
  if (additionalFields.isCollaborationRestrictedToEnterprise !== undefined)
    body.is_collaboration_restricted_to_enterprise = additionalFields.isCollaborationRestrictedToEnterprise;
  if (additionalFields.tags) body.tags = String(additionalFields.tags).split(",").map((t: string) => t.trim());
  if (additionalFields.uploadEmailAccess) {
    body.upload_email_access = { access: additionalFields.uploadEmailAccess };
  }
  return boxApi(token, "PUT", `/folders/${folderId}`, body);
}
