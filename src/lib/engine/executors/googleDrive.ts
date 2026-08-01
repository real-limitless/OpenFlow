import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function val(raw: unknown, itemJson: Record<string, unknown>): string {
  const v = resolveValue(raw, itemJson);
  return v == null ? "" : String(v);
}

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const credName = "googleApi";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error("GoogleDrive: googleApi credential is not configured");
  }
  const accessToken = (cred as Record<string, unknown>).accessToken as string | undefined;
  if (!accessToken) {
    throw new Error("GoogleDrive: no accessToken in googleApi credential");
  }
  return accessToken;
}

async function apiFetch(
  url: string,
  accessToken: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...(options.headers ?? {}),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GoogleDrive API ${res.status}: ${text || res.statusText}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  return { data: await res.text() };
}

async function runFileOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const accessToken = await getAccessToken(ctx);

  switch (operation) {
    case "create": {
      const fileName = val(ctx.getParam("fileName") ?? node.parameters.fileName, itemJson);
      const content = val(ctx.getParam("content") ?? node.parameters.content, itemJson);
      const convertToDoc = ctx.getParam("convertToGoogleDocument") ?? node.parameters.convertToGoogleDocument ?? false;
      const parentId = val(ctx.getParam("parentId") ?? node.parameters.parentId ?? "", itemJson);
      const mimeType = convertToDoc ? "application/vnd.google-apps.document" : "text/plain";

      const body: Record<string, unknown> = {
        name: fileName || "Untitled",
        mimeType,
      };
      if (parentId) {
        body.parents = [parentId];
      }

      const file = await apiFetch(`${DRIVE_API}/files`, accessToken, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
      });
      const fileId = file.id as string;

      if (content && fileId) {
        await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": mimeType,
            },
            body: content,
          },
        );
      }

      const meta = await apiFetch(`${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,parents,webViewLink`, accessToken);
      return meta as Record<string, unknown>;
    }

    case "copy": {
      const fileId = val(ctx.getParam("fileId") ?? node.parameters.fileId, itemJson);
      const newName = val(ctx.getParam("newName") ?? node.parameters.newName, itemJson);
      const copyInSameFolder = ctx.getParam("copyInSameFolder") ?? node.parameters.copyInSameFolder ?? true;
      if (!fileId) throw new Error("GoogleDrive: fileId is required for copy");

      const body: Record<string, unknown> = {};
      if (newName) body.name = newName;
      if (!copyInSameFolder) {
        const parentId = val(ctx.getParam("parentId") ?? node.parameters.parentId ?? "", itemJson);
        if (parentId) body.parents = [parentId];
      }

      const meta = await apiFetch(`${DRIVE_API}/files/${fileId}/copy`, accessToken, {
        method: "POST",
        body,
      });
      return meta as Record<string, unknown>;
    }

    case "delete": {
      const fileId = val(ctx.getParam("fileId") ?? node.parameters.fileId, itemJson);
      if (!fileId) throw new Error("GoogleDrive: fileId is required for delete");
      const permanent = ctx.getParam("deletePermanently") ?? node.parameters.deletePermanently ?? false;
      const url = permanent
        ? `${DRIVE_API}/files/${fileId}?supportsAllDrives=true&enforceSingleParent=true`
        : `${DRIVE_API}/files/${fileId}?supportsAllDrives=true`;
      await apiFetch(url, accessToken, { method: "DELETE" });
      return { id: fileId, deleted: true, permanent };
    }

    case "download": {
      const fileId = val(ctx.getParam("fileId") ?? node.parameters.fileId, itemJson);
      if (!fileId) throw new Error("GoogleDrive: fileId is required for download");
      const outputField = val(ctx.getParam("outputField") ?? node.parameters.outputField ?? "data", itemJson);
      const convertTo = val(ctx.getParam("convertTo") ?? node.parameters.convertTo ?? "", itemJson);

      const meta = await apiFetch(
        `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,parents,webViewLink,size,trashed`,
        accessToken,
      );

      const exportUrl = convertTo
        ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(convertTo)}`
        : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

      const res = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`GoogleDrive download failed: ${res.status}: ${text || res.statusText}`);
      }

      const buffer = await res.arrayBuffer();
      const mimeTypeFromRes = res.headers.get("content-type") ?? (convertTo || "application/octet-stream");
      const fileName = (meta.name as string) || "download";

      return {
        json: meta,
        binary: {
          [outputField]: {
            data: Buffer.from(buffer).toString("base64"),
            mimeType: mimeTypeFromRes,
            fileName,
          },
        },
      } as unknown as Record<string, unknown>;
    }

    case "move": {
      const fileId = val(ctx.getParam("fileId") ?? node.parameters.fileId, itemJson);
      if (!fileId) throw new Error("GoogleDrive: fileId is required for move");
      const parentId = val(ctx.getParam("parentId") ?? node.parameters.parentId, itemJson);
      if (!parentId) throw new Error("GoogleDrive: parentId is required for move");

      await apiFetch(`${DRIVE_API}/files/${fileId}?supportsAllDrives=true&addParents=${encodeURIComponent(parentId)}&removeParents=root`, accessToken, {
        method: "PATCH",
        body: {},
      });
      return { id: fileId, moved: true, parents: [parentId] };
    }

    case "share": {
      const fileId = val(ctx.getParam("fileId") ?? node.parameters.fileId, itemJson);
      if (!fileId) throw new Error("GoogleDrive: fileId is required for share");
      const permissionsRaw = ctx.getParam("permissions") ?? node.parameters.permissions ?? {};
      const perms = (permissionsRaw as Record<string, unknown>).permissionValues as Array<Record<string, unknown>> | undefined;
      if (!perms || perms.length === 0) throw new Error("GoogleDrive: at least one permission is required");

      const results: Record<string, unknown>[] = [];
      for (const perm of perms) {
        const role = String(perm.role ?? "reader");
        const type = String(perm.type ?? "user");
        const email = val(perm.email ?? "", itemJson) || undefined;
        const body: Record<string, unknown> = { role, type };
        if (email) body.emailAddress = email;
        const result = await apiFetch(
          `${DRIVE_API}/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=true`,
          accessToken,
          { method: "POST", body },
        );
        results.push(result as Record<string, unknown>);
      }
      return { id: fileId, permissions: results };
    }

    case "update": {
      const fileId = val(ctx.getParam("fileId") ?? node.parameters.fileId, itemJson);
      if (!fileId) throw new Error("GoogleDrive: fileId is required for update");
      const moveToTrash = ctx.getParam("moveToTrash") ?? node.parameters.moveToTrash ?? false;
      const changeContent = ctx.getParam("changeFileContent") ?? node.parameters.changeFileContent ?? false;
      const newFileName = val(ctx.getParam("newFileName") ?? node.parameters.newFileName ?? "", itemJson);

      if (moveToTrash) {
        await apiFetch(`${DRIVE_API}/files/${fileId}?supportsAllDrives=true`, accessToken, {
          method: "PATCH",
          body: { trashed: true },
        });
        return { id: fileId, trashed: true };
      }

      const body: Record<string, unknown> = {};
      if (newFileName) body.name = newFileName;

      let meta: Record<string, unknown> = {};
      if (Object.keys(body).length > 0 || changeContent) {
        if (Object.keys(body).length > 0) {
          meta = (await apiFetch(`${DRIVE_API}/files/${fileId}?supportsAllDrives=true&fields=id,name,mimeType,parents,webViewLink`, accessToken, {
            method: "PATCH",
            body,
          })) as Record<string, unknown>;
        } else {
          meta = await apiFetch(
            `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,parents,webViewLink`,
            accessToken,
          );
        }
      } else {
        meta = await apiFetch(
          `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,parents,webViewLink`,
          accessToken,
        );
      }

      return meta;
    }

    case "upload": {
      const binaryField = val(ctx.getParam("binaryField") ?? node.parameters.binaryField ?? "data", itemJson);
      const fileName = val(ctx.getParam("fileName") ?? node.parameters.fileName ?? "", itemJson);
      const parentId = val(ctx.getParam("parentId") ?? node.parameters.parentId ?? "", itemJson);

      throw new Error("GoogleDrive upload: binary data upload not yet implemented in this build");
    }

    default:
      throw new Error(`GoogleDrive: unknown file operation "${operation}"`);
  }
}

async function runFileFolderOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const accessToken = await getAccessToken(ctx);

  if (operation === "search") {
    const searchMode = String(ctx.getParam("searchMode") ?? node.parameters.searchMode ?? "name");
    const query = val(ctx.getParam("query") ?? node.parameters.query, itemJson);
    const whatToSearch = String(ctx.getParam("whatToSearch") ?? node.parameters.whatToSearch ?? "filesFolders");
    const includeTrashed = ctx.getParam("includeTrashed") ?? node.parameters.includeTrashed ?? false;
    const returnAll = ctx.getParam("returnAll") ?? node.parameters.returnAll ?? false;
    const limit = Number(ctx.getParam("limit") ?? node.parameters.limit ?? 50);
    const parentId = val(ctx.getParam("parentId") ?? node.parameters.parentId ?? "", itemJson);

    let qParts: string[] = [];
    if (searchMode === "name") {
      qParts.push(`name contains '${query.replace(/'/g, "\\'")}'`);
    } else {
      qParts.push(query);
    }
    if (!includeTrashed) qParts.push("trashed = false");
    if (whatToSearch === "files") {
      qParts.push("mimeType != 'application/vnd.google-apps.folder'");
    } else if (whatToSearch === "folders") {
      qParts.push("mimeType = 'application/vnd.google-apps.folder'");
    }
    if (parentId) qParts.push(`'${parentId}' in parents`);
    const q = qParts.join(" and ");

    const maxResults = returnAll ? 1000 : limit;
    let results: Record<string, unknown>[] = [];
    let pageToken: string | undefined;
    do {
      let url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&pageSize=${Math.min(maxResults, 100)}&fields=files(id,name,mimeType,parents,webViewLink,trashed),nextPageToken&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
      const data = (await apiFetch(url, accessToken)) as Record<string, unknown>;
      const files = (data.files as Array<Record<string, unknown>>) ?? [];
      results = results.concat(files);
      pageToken = data.nextPageToken as string | undefined;
      if (!returnAll && results.length >= limit) break;
    } while (pageToken);

    if (!returnAll) results = results.slice(0, limit);
    return { files: results };
  }

  throw new Error(`GoogleDrive: unknown fileFolder operation "${operation}"`);
}

async function runFolderOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const accessToken = await getAccessToken(ctx);

  switch (operation) {
    case "create": {
      const folderName = val(ctx.getParam("folderName") ?? node.parameters.folderName, itemJson);
      const parentId = val(ctx.getParam("parentId") ?? node.parameters.parentId ?? "", itemJson);
      if (!folderName) throw new Error("GoogleDrive: folderName is required");

      const body: Record<string, unknown> = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      };
      if (parentId) body.parents = [parentId];

      const meta = await apiFetch(`${DRIVE_API}/files`, accessToken, {
        method: "POST",
        body,
      });
      return meta as Record<string, unknown>;
    }

    case "delete": {
      const folderId = val(ctx.getParam("folderId") ?? node.parameters.folderId, itemJson);
      if (!folderId) throw new Error("GoogleDrive: folderId is required for delete");
      const permanent = ctx.getParam("deletePermanently") ?? node.parameters.deletePermanently ?? false;
      const url = permanent
        ? `${DRIVE_API}/files/${folderId}?supportsAllDrives=true`
        : `${DRIVE_API}/files/${folderId}?supportsAllDrives=true`;
      await apiFetch(url, accessToken, { method: "DELETE" });
      return { id: folderId, deleted: true, permanent };
    }

    case "share": {
      const folderId = val(ctx.getParam("folderId") ?? node.parameters.folderId, itemJson);
      if (!folderId) throw new Error("GoogleDrive: folderId is required for share");

      const permissionsRaw = ctx.getParam("permissions") ?? node.parameters.permissions ?? {};
      const perms = (permissionsRaw as Record<string, unknown>).permissionValues as Array<Record<string, unknown>> | undefined;
      if (!perms || perms.length === 0) throw new Error("GoogleDrive: at least one permission is required");

      const results: Record<string, unknown>[] = [];
      for (const perm of perms) {
        const role = String(perm.role ?? "reader");
        const type = String(perm.type ?? "user");
        const email = val(perm.email ?? "", itemJson) || undefined;
        const body: Record<string, unknown> = { role, type };
        if (email) body.emailAddress = email;
        const result = await apiFetch(
          `${DRIVE_API}/files/${folderId}/permissions?supportsAllDrives=true`,
          accessToken,
          { method: "POST", body },
        );
        results.push(result as Record<string, unknown>);
      }
      return { id: folderId, permissions: results };
    }

    default:
      throw new Error(`GoogleDrive: unknown folder operation "${operation}"`);
  }
}

async function runDriveOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const accessToken = await getAccessToken(ctx);

  switch (operation) {
    case "create": {
      const name = val(ctx.getParam("driveName") ?? node.parameters.driveName, itemJson);
      if (!name) throw new Error("GoogleDrive: drive name is required");

      const meta = await apiFetch(`${DRIVE_API}/drives?requestId=${Date.now()}`, accessToken, {
        method: "POST",
        body: { name },
      });
      return meta as Record<string, unknown>;
    }

    case "delete": {
      const driveId = val(ctx.getParam("driveId") ?? node.parameters.driveId, itemJson);
      if (!driveId) throw new Error("GoogleDrive: driveId is required for delete");
      await apiFetch(`${DRIVE_API}/drives/${driveId}`, accessToken, {
        method: "DELETE",
      });
      return { id: driveId, deleted: true };
    }

    case "get": {
      const driveId = val(ctx.getParam("driveId") ?? node.parameters.driveId, itemJson);
      if (!driveId) throw new Error("GoogleDrive: driveId is required for get");
      const meta = await apiFetch(`${DRIVE_API}/drives/${driveId}`, accessToken);
      return meta as Record<string, unknown>;
    }

    case "getAll": {
      const returnAll = ctx.getParam("returnAll") ?? node.parameters.returnAll ?? false;
      const limit = Number(ctx.getParam("limit") ?? node.parameters.limit ?? 50);
      const query = val(ctx.getParam("query") ?? node.parameters.query ?? "", itemJson);

      const maxResults = returnAll ? 1000 : limit;
      const url = `${DRIVE_API}/drives?pageSize=${Math.min(maxResults, 100)}${query ? `&q=${encodeURIComponent(query)}` : ""}&fields=drives(id,name,colorRgb,hidden,createdTime),nextPageToken`;
      const data = (await apiFetch(url, accessToken)) as Record<string, unknown>;
      const drives = (data.drives as Array<Record<string, unknown>>) ?? [];
      return { drives: returnAll ? drives : drives.slice(0, limit) };
    }

    case "update": {
      const driveId = val(ctx.getParam("driveId") ?? node.parameters.driveId, itemJson);
      if (!driveId) throw new Error("GoogleDrive: driveId is required for update");
      const name = val(ctx.getParam("driveName") ?? node.parameters.driveName ?? "", itemJson);

      const body: Record<string, unknown> = {};
      if (name) body.name = name;

      const meta = await apiFetch(`${DRIVE_API}/drives/${driveId}`, accessToken, {
        method: "PATCH",
        body,
      });
      return meta as Record<string, unknown>;
    }

    default:
      throw new Error(`GoogleDrive: unknown drive operation "${operation}"`);
  }
}

export const googleDriveExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "file") ?? "file");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: Record<string, unknown>;
      switch (resource) {
        case "file":
          result = await runFileOperation(ctx, node, operation, itemJson);
          break;
        case "fileFolder":
          result = await runFileFolderOperation(ctx, node, operation, itemJson);
          break;
        case "folder":
          result = await runFolderOperation(ctx, node, operation, itemJson);
          break;
        case "drive":
          result = await runDriveOperation(ctx, node, operation, itemJson);
          break;
        default:
          throw new Error(`GoogleDrive: unknown resource "${resource}"`);
      }

      if (result && result.binary) {
        const { json, binary } = result as { json: Record<string, unknown>; binary: Record<string, unknown> };
        out.push({ json, binary, pairedItem });
      } else {
        out.push({ json: result, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
