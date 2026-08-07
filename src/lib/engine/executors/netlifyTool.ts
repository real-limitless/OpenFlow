import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const NETLIFY_API = "https://api.netlify.com/api/v1";
const MAX_PER_PAGE = 100;

function resolve(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const netlifyToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "deploy");
  const operation = ctx.getParam<string>("operation", "getAll");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("netlifyApi");
  const token = cred?.accessToken ?? cred?.access_token ?? "";
  if (!token) {
    throw new Error("Netlify Tool: netlifyApi credential is not configured or missing accessToken");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemJson = item.json ?? {};
    try {
      let result: unknown;

      if (resource === "deploy") {
        result = await handleDeploy(operation, ctx, itemJson, headers);
      } else if (resource === "site") {
        result = await handleSite(operation, ctx, itemJson, headers);
      } else {
        throw new Error(`Netlify Tool: unsupported resource "${resource}"`);
      }

      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({
            json: r as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: i, input: 0 },
          });
        }
      } else {
        out.push({
          json: result as Record<string, unknown>,
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      }
    } catch (err) {
      if (continueOnFail) {
        continue;
      }
      throw err;
    }
  }

  return [out];
};

function rp(
  ctx: Parameters<NodeExecutor>[0],
  name: string,
  itemJson: Record<string, unknown>,
  defaultVal?: unknown,
): unknown {
  return resolve(ctx.getParam(name) ?? defaultVal, itemJson);
}

async function handleDeploy(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<unknown> {
  if (operation === "cancel") {
    const deployId = String(rp(ctx, "deployId", itemJson) ?? "");
    if (!deployId) throw new Error("Netlify Tool: deployId is required for cancel");
    return apiPost(`/deploys/${encodeURIComponent(deployId)}/cancel`, undefined, headers);
  }

  if (operation === "create") {
    const siteId = String(rp(ctx, "siteId", itemJson) ?? "");
    if (!siteId) throw new Error("Netlify Tool: siteId is required for deploy create");
    const additionalFields = (rp(ctx, "additionalFields", itemJson) ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {};
    if (additionalFields.branch) body.branch = additionalFields.branch;
    if (additionalFields.title) body.title = additionalFields.title;
    return apiPost(`/sites/${encodeURIComponent(siteId)}/deploys`, body, headers);
  }

  if (operation === "get") {
    const siteId = String(rp(ctx, "siteId", itemJson) ?? "");
    const deployId = String(rp(ctx, "deployId", itemJson) ?? "");
    if (!deployId) throw new Error("Netlify Tool: deployId is required for get");
    if (!siteId) throw new Error("Netlify Tool: siteId is required for deploy get");
    return apiGet(`/sites/${encodeURIComponent(siteId)}/deploys/${encodeURIComponent(deployId)}`, headers);
  }

  if (operation === "getAll") {
    const siteId = String(rp(ctx, "siteId", itemJson) ?? "");
    if (!siteId) throw new Error("Netlify Tool: siteId is required for deploy getAll");
    const returnAll = Boolean(rp(ctx, "returnAll", itemJson) ?? false);
    const limit = Math.min(Math.max(1, Number(rp(ctx, "limit", itemJson) ?? 50)), 200);
    const results = await paginatedGet(`/sites/${encodeURIComponent(siteId)}/deploys`, headers, returnAll, limit);
    return results;
  }

  throw new Error(`Netlify Tool: unsupported deploy operation "${operation}"`);
}

async function handleSite(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<unknown> {
  if (operation === "getAll") {
    const returnAll = Boolean(rp(ctx, "returnAll", itemJson) ?? false);
    const limit = Math.min(Math.max(1, Number(rp(ctx, "limit", itemJson) ?? 50)), 200);
    const results = await paginatedGet("/sites", headers, returnAll, limit);
    return results;
  }

  if (operation === "get") {
    const siteId = String(rp(ctx, "siteId", itemJson) ?? "");
    if (!siteId) throw new Error("Netlify Tool: siteId is required for site get");
    return apiGet(`/sites/${encodeURIComponent(siteId)}`, headers);
  }

  if (operation === "delete") {
    const siteId = String(rp(ctx, "siteId", itemJson) ?? "");
    if (!siteId) throw new Error("Netlify Tool: siteId is required for site delete");
    await apiDelete(`/sites/${encodeURIComponent(siteId)}`, headers);
    return { success: true };
  }

  throw new Error(`Netlify Tool: unsupported site operation "${operation}"`);
}

async function paginatedGet(
  path: string,
  headers: Record<string, string>,
  returnAll: boolean,
  limit: number,
): Promise<unknown[]> {
  const perPage = returnAll ? MAX_PER_PAGE : Math.min(limit, MAX_PER_PAGE);
  let page = 1;
  const all: unknown[] = [];

  for (;;) {
    const qs = `?page=${page}&per_page=${perPage}`;
    const res = await fetch(`${NETLIFY_API}${path}${qs}`, { method: "GET", headers });
    const data = await handleResponse(res);

    if (Array.isArray(data)) {
      all.push(...data);
    } else if (data) {
      all.push(data);
      break;
    } else {
      break;
    }

    if (!returnAll) break;

    const link = parseLinkHeader(res.headers.get("Link"));
    if (!link?.next) break;

    page++;
  }

  return all;
}

function parseLinkHeader(header: string | null): Record<string, string> | null {
  if (!header) return null;
  const links: Record<string, string> = {};
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) links[match[2]] = match[1];
  }
  return links;
}

async function apiGet(path: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${NETLIFY_API}${path}`, { method: "GET", headers });
  return handleResponse(res);
}

async function apiPost(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${NETLIFY_API}${path}`, {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse(res);
}

async function apiDelete(path: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${NETLIFY_API}${path}`, { method: "DELETE", headers });
  if (res.status < 200 || res.status >= 300) {
    const text = await res.text().catch(() => "");
    throw new Error(`Netlify API: HTTP ${res.status} ${text}`);
  }
}

async function handleResponse(res: Response): Promise<unknown> {
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
    const errMsg =
      (parsed as Record<string, unknown>)?.message ??
      (parsed as Record<string, unknown>)?.error ??
      `HTTP ${res.status}`;
    throw new Error(`Netlify API: ${errMsg}`);
  }
  return parsed;
}
