import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

interface StrapiCredential {
  url: string;
  apiVersion: "v4" | "v3";
  apiToken?: string;
  email?: string;
  password?: string;
}

function buildBasePath(apiVersion: string): string {
  if (apiVersion === "v3") return "/v3";
  return "/api";
}

function buildUrl(cred: StrapiCredential, pathSegments: string[], query?: Record<string, string>): string {
  const base = cred.url.replace(/\/+$/, "");
  const apiBase = buildBasePath(cred.apiVersion);
  const path = pathSegments.join("/");
  const url = `${base}${apiBase}${path}`;
  if (!query) return url;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${url}?${qs}` : url;
}

function buildBody(resource: string, dataToSend?: { fields?: Array<{ fieldName: string; fieldValue: unknown }> }): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (dataToSend?.fields) {
    for (const f of dataToSend.fields) {
      if (f.fieldName) {
        body[f.fieldName] = f.fieldValue;
      }
    }
  }
  return { data: body };
}

function buildOptionsQuery(options?: Record<string, unknown>): Record<string, string> {
  if (!options) return {};
  const q: Record<string, string> = {};
  if (typeof options.sort === "string") q["sort"] = options.sort;
  if (typeof options.filters === "object" && options.filters !== null) {
    q["filters"] = JSON.stringify(options.filters);
  }
  if (typeof options.populate === "string") q["populate"] = options.populate;
  if (typeof options.fields === "string") q["fields"] = options.fields;
  if (typeof options.locale === "string") q["locale"] = options.locale;
  if (typeof options.publicationFilter === "string") q["publicationState"] = options.publicationFilter;
  return q;
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

export const strapiExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = ctx.getParam<string>("resource", "entry");
  const operation = ctx.getParam<string>("operation");
  const contentType = ctx.getParam<string>("contentType", "");
  const documentId = ctx.getParam<string>("documentId", "");
  const dataToSend = ctx.getParam<{ fields?: Array<{ fieldName: string; fieldValue: unknown }> }>("dataToSend");
  const returnAll = ctx.getParam<boolean>("returnAll", false);
  const limit = ctx.getParam<number>("limit", 25);
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const cred = await ctx.getCredential<StrapiCredential>("strapiApi");

  if (!cred) {
    throw new Error("Strapi credential is required");
  }

  const results: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const pluralApiId = ctx.evaluate(contentType, items[i].json, i) as string;
    const docId = ctx.evaluate(documentId, items[i].json, i) as string;

    try {
      let output: INodeExecutionData;

      if (operation === "create") {
        const body = buildBody(resource, dataToSend);
        const url = buildUrl(cred, ["", pluralApiId]);
        const res = await strapiFetch(url, "POST", cred, body);

        if (!res.ok) {
          throw new Error(`Strapi create failed: ${res.status} ${JSON.stringify(res.data)}`);
        }

        output = { json: res.data as Record<string, unknown>, pairedItem: { item: i, input: 0 } };
      } else if (operation === "delete") {
        const url = buildUrl(cred, ["", pluralApiId, docId]);
        const res = await strapiFetch(url, "DELETE", cred);

        if (!res.ok) {
          throw new Error(`Strapi delete failed: ${res.status} ${JSON.stringify(res.data)}`);
        }

        output = { json: res.data as Record<string, unknown>, pairedItem: { item: i, input: 0 } };
      } else if (operation === "get") {
        const query = buildOptionsQuery(options);
        const url = buildUrl(cred, ["", pluralApiId, docId], query);
        const res = await strapiFetch(url, "GET", cred);

        if (!res.ok) {
          throw new Error(`Strapi get failed: ${res.status} ${JSON.stringify(res.data)}`);
        }

        output = { json: res.data as Record<string, unknown>, pairedItem: { item: i, input: 0 } };
      } else if (operation === "getMany") {
        const query = buildOptionsQuery(options);
        const pageSize = returnAll ? 100 : Math.min(limit, 100);

        if (!returnAll) {
          query["pageSize"] = String(pageSize);
          const url = buildUrl(cred, ["", pluralApiId], query);
          const res = await strapiFetch(url, "GET", cred);

          if (!res.ok) {
            throw new Error(`Strapi getMany failed: ${res.status} ${JSON.stringify(res.data)}`);
          }

          output = { json: res.data as Record<string, unknown>, pairedItem: { item: i, input: 0 } };
        } else {
          const allData: unknown[] = [];
          let page = 1;
          query["pageSize"] = "100";

          while (true) {
            query["page"] = String(page);
            const url = buildUrl(cred, ["", pluralApiId], query);
            const res = await strapiFetch(url, "GET", cred);

            if (!res.ok) {
              throw new Error(`Strapi getMany failed: ${res.status} ${JSON.stringify(res.data)}`);
            }

            const pageData = res.data as { data?: unknown[]; meta?: { pagination?: { total: number; pageCount: number } } };
            if (pageData?.data) {
              allData.push(...pageData.data);
            }

            const pagination = pageData?.meta?.pagination;
            if (!pagination || page >= (pagination.pageCount ?? 1)) break;
            page++;
          }

          output = { json: { data: allData, meta: {} }, pairedItem: { item: i, input: 0 } };
        }
      } else if (operation === "update") {
        const body = buildBody(resource, dataToSend);
        const url = buildUrl(cred, ["", pluralApiId, docId]);
        const res = await strapiFetch(url, "PUT", cred, body);

        if (!res.ok) {
          throw new Error(`Strapi update failed: ${res.status} ${JSON.stringify(res.data)}`);
        }

        output = { json: res.data as Record<string, unknown>, pairedItem: { item: i, input: 0 } };
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }

      results.push(output);
    } catch (e) {
      if (ctx.continueOnFail()) {
        results.push({
          json: { error: e instanceof Error ? { message: e.message } : { message: String(e) } },
          pairedItem: { item: i, input: 0 },
        });
      } else {
        throw e;
      }
    }
  }

  return [results];
};