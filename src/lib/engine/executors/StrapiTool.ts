import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

interface StrapiCredential {
  url: string;
  apiVersion: "v4" | "v3";
  apiToken?: string;
  email?: string;
  password?: string;
}

function basePath(apiVersion: string): string {
  return apiVersion === "v3" ? "/v3" : "/api";
}

function buildUrl(cred: StrapiCredential, segments: string[], query?: Record<string, string>): string {
  const base = cred.url.replace(/\/+$/, "");
  const bp = basePath(cred.apiVersion);
  const path = segments.join("/");
  const url = `${base}${bp}${path}`;
  if (!query) return url;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${url}?${qs}` : url;
}

async function strapiFetch(
  url: string,
  method: string,
  cred: StrapiCredential,
  body?: unknown,
): Promise<{ status: number; ok: boolean; data: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (cred.apiToken) {
    headers["Authorization"] = `Bearer ${cred.apiToken}`;
  } else if (cred.email && cred.password) {
    const loginUrl = buildUrl(cred, ["auth", "local"]);
    const loginRes = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: cred.email, password: cred.password }),
    });
    if (!loginRes.ok) {
      const errBody = await loginRes.text();
      throw new Error(`Strapi authentication failed: ${loginRes.status} ${errBody}`);
    }
    const loginData = (await loginRes.json()) as { jwt: string };
    headers["Authorization"] = `Bearer ${loginData.jwt}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }

  return { status: res.status, ok: res.ok, data };
}

function extractColumnValues(
  columnsRaw: string | undefined,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (!columnsRaw) return values;
  const keys = columnsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const key of keys) {
    values[key] = key in itemJson ? itemJson[key] : "";
  }
  return values;
}

function buildOptionsQuery(options?: Record<string, unknown>): Record<string, string> {
  if (!options) return {};
  const q: Record<string, string> = {};
  if (typeof options.sort === "string") q["sort"] = options.sort;
  if (typeof options.where === "string") q["filters"] = options.where;
  if (typeof options.publicationState === "string") q["publicationState"] = options.publicationState;
  return q;
}

export const strapiToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = String(node.parameters.operation ?? "get");
  const contentType = String(node.parameters.contentType ?? "");
  const entryId = String(node.parameters.entryId ?? "");
  const columns = String(node.parameters.columns ?? "");
  const updateKey = String(node.parameters.updateKey ?? "id");
  const returnAll = Boolean(node.parameters.returnAll ?? false);
  const limit = Number(node.parameters.limit ?? 50);
  const options = node.parameters.options as Record<string, unknown> | undefined;
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("strapiApi") as StrapiCredential | null;

  const results: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    if (!cred) {
      if (!continueOnFail) throw new Error("Strapi Tool: strapiApi credential is required");
      results.push({ json: { error: { message: "Strapi Tool: strapiApi credential is required" } }, pairedItem: { item: i, input: 0 } });
      continue;
    }
    const item = items[i];
    const itemJson = item.json ?? {};
    const pairedItem = { item: i, input: 0 };

    try {
      const pluralApiId = contentType || String(itemJson.contentType || "");
      if (!pluralApiId) throw new Error("Strapi Tool: contentType is required");

      let output: INodeExecutionData;

      if (operation === "create") {
        const fieldValues = extractColumnValues(columns, itemJson);
        const body = { data: fieldValues };
        const url = buildUrl(cred, ["", pluralApiId]);
        const res = await strapiFetch(url, "POST", cred, body);
        if (!res.ok) throw new Error(`Strapi create failed: ${res.status} ${JSON.stringify(res.data)}`);
        output = { json: res.data as Record<string, unknown>, pairedItem };
      } else if (operation === "delete") {
        const resolvedEntryId = entryId || String(itemJson.entryId || "");
        if (!resolvedEntryId) throw new Error("Strapi Tool: entryId is required");
        const url = buildUrl(cred, ["", pluralApiId, resolvedEntryId]);
        const res = await strapiFetch(url, "DELETE", cred);
        if (!res.ok) throw new Error(`Strapi delete failed: ${res.status} ${JSON.stringify(res.data)}`);
        output = { json: res.data as Record<string, unknown>, pairedItem };
      } else if (operation === "get") {
        const resolvedEntryId = entryId || String(itemJson.entryId || "");
        if (!resolvedEntryId) throw new Error("Strapi Tool: entryId is required");
        const query = buildOptionsQuery(options);
        const url = buildUrl(cred, ["", pluralApiId, resolvedEntryId], query);
        const res = await strapiFetch(url, "GET", cred);
        if (!res.ok) throw new Error(`Strapi get failed: ${res.status} ${JSON.stringify(res.data)}`);
        output = { json: res.data as Record<string, unknown>, pairedItem };
      } else if (operation === "getAll") {
        const query = buildOptionsQuery(options) as Record<string, string>;
        if (!returnAll) {
          query["pageSize"] = String(Math.min(limit, 100));
          const url = buildUrl(cred, ["", pluralApiId], query);
          const res = await strapiFetch(url, "GET", cred);
          if (!res.ok) throw new Error(`Strapi getMany failed: ${res.status} ${JSON.stringify(res.data)}`);
          output = { json: res.data as Record<string, unknown>, pairedItem };
        } else {
          const allData: unknown[] = [];
          let page = 1;
          const pageQuery: Record<string, string> = { ...query, pageSize: "100" };
          while (true) {
            pageQuery["page"] = String(page);
            const pageUrl = buildUrl(cred, ["", pluralApiId], pageQuery);
            const res = await strapiFetch(pageUrl, "GET", cred);
            if (!res.ok) throw new Error(`Strapi getMany failed: ${res.status} ${JSON.stringify(res.data)}`);
            const pageData = res.data as { data?: unknown[]; meta?: { pagination?: { pageCount: number } } };
            if (pageData?.data) allData.push(...pageData.data);
            const pagination = pageData?.meta?.pagination;
            if (!pagination || page >= (pagination.pageCount ?? 1)) break;
            page++;
          }
          output = { json: { data: allData, meta: {} }, pairedItem };
        }
      } else if (operation === "update") {
        const keyValue = updateKey === "id"
          ? (entryId || String(itemJson.entryId || ""))
          : String(itemJson[updateKey] ?? "");
        if (!keyValue) throw new Error("Strapi Tool: entry identifier is required for update");
        const fieldValues = extractColumnValues(columns, itemJson);
        const body = { data: fieldValues };
        const url = buildUrl(cred, ["", pluralApiId, keyValue]);
        const res = await strapiFetch(url, "PUT", cred, body);
        if (!res.ok) throw new Error(`Strapi update failed: ${res.status} ${JSON.stringify(res.data)}`);
        output = { json: res.data as Record<string, unknown>, pairedItem };
      } else {
        throw new Error(`Strapi Tool: unsupported operation "${operation}"`);
      }

      results.push(output);
    } catch (e) {
      if (!continueOnFail) throw e;
      results.push({
        json: { error: e instanceof Error ? { message: e.message } : { message: String(e) } },
        pairedItem,
      });
    }
  }

  return [results];
};
