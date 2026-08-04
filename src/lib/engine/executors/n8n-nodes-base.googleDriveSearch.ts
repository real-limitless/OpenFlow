import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleDriveOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleDriveSearch: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleDriveSearch: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
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
    throw new Error(`GoogleDriveSearch: ${msg}`);
  }
  return { status: res.status, body: parsed };
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

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  return raw;
}

function resolveParent(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): string {
  const f = resolveValue(params.folderId, itemJson);
  if (f && typeof f === "string") return String(f);
  const d = resolveValue(params.driveId, itemJson);
  if (d && typeof d === "string") return String(d);
  return "";
}

export const googleDriveSearchExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();
  const token = await getAccessToken(ctx, node);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const params = node.parameters;
      const searchMode = String(resolveValue(params.searchMode, itemJson) ?? "name");
      const query = String(resolveValue(params.query, itemJson) ?? "");
      const returnAll = params.returnAll === true;
      const limit = Number(params.limit ?? 50);
      const whatToSearch = String(resolveValue(params.whatToSearch, itemJson) ?? "filesFolders");
      const includeTrashed = params.includeTrashed === true;
      const parent = resolveParent(params, itemJson);

      const qParts: string[] = [];
      if (searchMode === "name") {
        qParts.push(`name contains '${query.replace(/'/g, "\\'")}'`);
      } else {
        qParts.push(query);
      }
      if (whatToSearch === "files") {
        qParts.push("mimeType != 'application/vnd.google-apps.folder'");
      } else if (whatToSearch === "folders") {
        qParts.push("mimeType = 'application/vnd.google-apps.folder'");
      }
      if (!includeTrashed) {
        qParts.push("trashed = false");
      }
      if (parent) {
        qParts.push(`'${parent}' in parents`);
      }

      const q = qParts.join(" and ");
      const qs: Record<string, string> = { q };

      const fields = params.fields;
      if (Array.isArray(fields) && fields.length > 0 && !fields.includes("All")) {
        qs.fields = `files(${fields.join(",")})`;
      }

      const files = await paginate(DRIVE_API, token, qs, returnAll, limit);

      const result: Record<string, unknown> = {
        kind: "drive#fileList",
        incompleteSearch: false,
        files,
      };

      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
