import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.dropboxapi.com/2";
const CONTENT_BASE = "https://content.dropboxapi.com/2";

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("dropboxApi") ?? await ctx.getCredential("dropboxOAuth2Api");
  const token = cred ? String(cred.accessToken ?? cred.access_token ?? "") : "";
  if (!token) {
    throw new Error("Dropbox: credential is not configured");
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
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const errObj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
    throw new Error(
      `Dropbox API error: ${(errObj.error_summary as string) ?? res.statusText}`,
    );
  }
  return (parsed ?? {}) as Record<string, unknown>;
}

async function dropboxUpload(
  token: string,
  path: string,
  contents: string,
  mode: string = "add",
  autorename: boolean = true,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${CONTENT_BASE}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path, mode, autorename }),
      "Content-Type": "application/octet-stream",
    },
    body: contents,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const errObj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
    throw new Error(
      `Dropbox upload error: ${(errObj.error_summary as string) ?? res.statusText}`,
    );
  }
  return (parsed ?? {}) as Record<string, unknown>;
}

async function dropboxDownload(
  token: string,
  path: string,
): Promise<{ metadata: Record<string, unknown>; content: string }> {
  const res = await fetch(`${CONTENT_BASE}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
  });
  const text = await res.text();
  const metaHeader = res.headers.get("Dropbox-API-Result") ?? "{}";
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(metaHeader); } catch { /* ignore */ }
  if (!res.ok) {
    throw new Error(`Dropbox download error: ${res.statusText}`);
  }
  return { metadata, content: text };
}

export const dropboxExecutor: NodeExecutor = async (ctx, node) => {
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
      const result = await runOperation(ctx, node, resource, operation, itemJson);
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

function resolveValue(raw: unknown, _itemJson: Record<string, unknown>): string {
  if (raw == null) return "";
  return String(raw);
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);

  if (resource === "file") {
    if (operation === "upload") {
      return runUpload(token, node, itemJson);
    }
    if (operation === "download") {
      return runDownload(token, node, itemJson);
    }
    if (operation === "copy") {
      return runCopy(token, node, itemJson);
    }
    if (operation === "delete") {
      return runDelete(token, node, itemJson);
    }
    if (operation === "move") {
      return runMove(token, node, itemJson);
    }
  }

  if (resource === "folder") {
    if (operation === "create") {
      return runCreateFolder(token, node, itemJson);
    }
    if (operation === "copy") {
      return runCopy(token, node, itemJson);
    }
    if (operation === "delete") {
      return runDelete(token, node, itemJson);
    }
    if (operation === "move") {
      return runMove(token, node, itemJson);
    }
  }

  if (resource === "search") {
    if (operation === "query") {
      return runSearch(token, node, itemJson);
    }
  }

  throw new Error(`Dropbox: unsupported resource "${resource}" / operation "${operation}"`);
}

function runUpload(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = resolveValue(node.parameters.path ?? node.parameters.filePath, itemJson);
  if (!path) throw new Error("Dropbox: path is required for upload");
  const data = resolveValue(node.parameters.data ?? node.parameters.fileData ?? itemJson.data, itemJson);
  const mode = resolveValue(node.parameters.mode, itemJson) || "add";
  const autorename = node.parameters.autorename !== false;
  return dropboxUpload(token, path, data, mode, autorename);
}

async function runDownload(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = resolveValue(node.parameters.path, itemJson);
  if (!path) throw new Error("Dropbox: path is required for download");
  const { metadata, content } = await dropboxDownload(token, path);
  return { ...metadata, data: content };
}

async function runCopy(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fromPath = resolveValue(node.parameters.fromPath ?? node.parameters.path, itemJson);
  const toPath = resolveValue(node.parameters.toPath, itemJson);
  if (!fromPath || !toPath) throw new Error("Dropbox: fromPath and toPath are required for copy");
  return dropboxRpc(token, "/files/copy_v2", { from_path: fromPath, to_path: toPath });
}

async function runDelete(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = resolveValue(node.parameters.path, itemJson);
  if (!path) throw new Error("Dropbox: path is required for delete");
  await dropboxRpc(token, "/files/delete_v2", { path });
  return { success: true, path };
}

async function runMove(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fromPath = resolveValue(node.parameters.fromPath ?? node.parameters.path, itemJson);
  const toPath = resolveValue(node.parameters.toPath, itemJson);
  if (!fromPath || !toPath) throw new Error("Dropbox: fromPath and toPath are required for move");
  return dropboxRpc(token, "/files/move_v2", { from_path: fromPath, to_path: toPath });
}

async function runCreateFolder(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = resolveValue(node.parameters.path, itemJson);
  if (!path) throw new Error("Dropbox: path is required for folder creation");
  const autorename = node.parameters.autorename !== false;
  return dropboxRpc(token, "/files/create_folder_v2", { path, autorename });
}

async function runSearch(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const query = resolveValue(node.parameters.query, itemJson);
  if (!query) throw new Error("Dropbox: query is required for search");
  const result = await dropboxRpc(token, "/files/search_v2", { query });
  return result;
}
