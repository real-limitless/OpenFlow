import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.dropboxapi.com/2";
const CONTENT_BASE = "https://content.dropboxapi.com/2";

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("dropboxApi") ?? await ctx.getCredential("dropboxOAuth2Api");
  const token = cred ? String(cred.accessToken ?? cred.access_token ?? "") : "";
  if (!token) {
    throw new Error("DropboxTool: credential is not configured");
  }
  return token;
}

async function dropboxRpc(
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { }
  if (!res.ok) {
    const errObj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
    throw new Error(
      `DropboxTool API error: ${(errObj.error_summary as string) ?? res.statusText}`,
    );
  }
  return (parsed ?? {}) as Record<string, unknown>;
}

async function dropboxUpload(
  token: string,
  path: string,
  contents: string | ArrayBuffer,
  mode: string = "add",
  autorename: boolean = true,
): Promise<Record<string, unknown>> {
  const body = typeof contents === "string" ? contents : new Uint8Array(contents as ArrayBuffer);
  const res = await fetch(`${CONTENT_BASE}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path, mode, autorename }),
      "Content-Type": "application/octet-stream",
    },
    body,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { }
  if (!res.ok) {
    const errObj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
    throw new Error(
      `DropboxTool upload error: ${(errObj.error_summary as string) ?? res.statusText}`,
    );
  }
  return (parsed ?? {}) as Record<string, unknown>;
}

async function dropboxDownload(
  token: string,
  path: string,
): Promise<{ metadata: Record<string, unknown>; content: ArrayBuffer }> {
  const res = await fetch(`${CONTENT_BASE}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
  });
  const content = await res.arrayBuffer();
  const metaHeader = res.headers.get("Dropbox-API-Result") ?? "{}";
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(metaHeader); } catch { }
  if (!res.ok) {
    throw new Error(`DropboxTool download error: ${res.statusText}`);
  }
  return { metadata, content };
}



export const dropboxToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "file");
  const operation = String(node.parameters.operation ?? "upload");
  const continueOnFail = ctx.continueOnFail();
  const token = await getToken(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const params = node.parameters as Record<string, unknown>;
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(token, resource, operation, params, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
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
  token: string,
  resource: string,
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (resource === "file") {
    if (operation === "upload") return runUpload(token, params, itemJson, item);
    if (operation === "download") return runDownload(token, params, itemJson);
    if (operation === "copy") return runCopy(token, params);
    if (operation === "move") return runMove(token, params);
    if (operation === "delete") return runDelete(token, params);
  }
  if (resource === "folder") {
    if (operation === "create") return runCreateFolder(token, params);
    if (operation === "list") return runListFolder(token, params);
    if (operation === "copy") return runCopy(token, params);
    if (operation === "move") return runMove(token, params);
    if (operation === "delete") return runDelete(token, params);
  }
  if (resource === "search" && operation === "query") {
    return runSearch(token, params);
  }
  throw new Error(`DropboxTool: unsupported resource "${resource}" / operation "${operation}"`);
}

async function runUpload(
  token: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const path = String(params.path ?? "");
  if (!path) throw new Error("DropboxTool: path is required for upload");

  const binaryData = params.binaryData === true;
  if (binaryData) {
    const binaryField = String(params.binaryPropertyName ?? "file");
    const binary = item.binary?.[binaryField];
    if (!binary) throw new Error(`DropboxTool: binary field "${binaryField}" not found on input`);
    const contents = binary.data;
    const decoded = Buffer.from(contents, "base64");
    return dropboxUpload(token, path, decoded.buffer, "add", true);
  }
  const contents = String(params.content ?? itemJson.data ?? "");
  return dropboxUpload(token, path, contents, "add", true);
}

async function runDownload(
  token: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = String(params.path ?? "");
  if (!path) throw new Error("DropboxTool: path is required for download");
  const { metadata, content } = await dropboxDownload(token, path);
  const base64 = Buffer.from(content).toString("base64");
  const outputField = String(params.binaryPropertyName ?? "data");
  const result: Record<string, unknown> = { ...metadata };
  result.binary = {
    [outputField]: {
      data: base64,
      mimeType: "application/octet-stream",
      fileName: String(metadata.name ?? "download"),
    },
  };
  return result;
}

async function runCopy(
  token: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fromPath = String(params.path ?? "");
  const toPath = String(params.toPath ?? "");
  if (!fromPath || !toPath) throw new Error("DropboxTool: path and toPath are required for copy");
  return dropboxRpc(token, "/files/copy_v2", { from_path: fromPath, to_path: toPath });
}

async function runMove(
  token: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fromPath = String(params.path ?? "");
  const toPath = String(params.toPath ?? "");
  if (!fromPath || !toPath) throw new Error("DropboxTool: path and toPath are required for move");
  return dropboxRpc(token, "/files/move_v2", { from_path: fromPath, to_path: toPath });
}

async function runDelete(
  token: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = String(params.path ?? "");
  if (!path) throw new Error("DropboxTool: path is required for delete");
  await dropboxRpc(token, "/files/delete_v2", { path });
  return { success: true, path };
}

async function runCreateFolder(
  token: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = String(params.path ?? "");
  if (!path) throw new Error("DropboxTool: path is required for folder creation");
  return dropboxRpc(token, "/files/create_folder_v2", { path, autorename: true });
}

async function runListFolder(
  token: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const path = String(params.path ?? "");
  const limit = Number(params.limit ?? 10);
  const returnAll = params.returnAll === true;
  const all: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  for (;;) {
    if (cursor) {
      const cont = await dropboxRpc(token, "/files/list_folder/continue", { cursor });
      const entries = (cont.entries as Record<string, unknown>[]) ?? [];
      all.push(...entries);
      if (!cont.has_more) break;
      cursor = String(cont.cursor ?? "");
    } else {
      const body: Record<string, unknown> = { path };
      if (!returnAll) body.limit = Math.min(Math.max(limit, 1), 500);
      const result = await dropboxRpc(token, "/files/list_folder", body);
      const entries = (result.entries as Record<string, unknown>[]) ?? [];
      all.push(...entries);
      if (!result.has_more) break;
      cursor = String(result.cursor ?? "");
    }
    if (!returnAll && all.length >= limit) return all.slice(0, limit);
  }
  return all;
}

async function runSearch(
  token: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const query = String(params.query ?? "");
  if (!query) throw new Error("DropboxTool: query is required for search");
  const limit = Number(params.limit ?? 10);
  const returnAll = params.returnAll === true;
  const all: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  for (;;) {
    const body: Record<string, unknown> = { query };
    if (!returnAll) body.max_results = Math.min(Math.max(limit, 1), 500);
    if (cursor) body.cursor = cursor;
    const result = await dropboxRpc(token, "/files/search_v2", body);
    const matches = (result.matches as Record<string, unknown>[]) ?? [];
    all.push(...matches);
    if (!result.has_more) break;
    cursor = String(result.cursor ?? "");
    if (!returnAll && all.length >= limit) return all.slice(0, limit);
  }
  return { matches: all };
}
