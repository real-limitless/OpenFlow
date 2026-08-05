import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const CDA_BASE = "https://cdn.contentful.com";
const CPA_BASE = "https://preview.contentful.com";

export const contentfulExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "entry");
  const operation = ctx.getParam<string>("operation", "get");
  const continueOnFail = ctx.continueOnFail();

  const credential = await ctx.getCredential("contentfulApi");
  if (!credential) {
    throw new Error("Contentful: credential is required");
  }

  const spaceId = credential.spaceId as string;
  const deliveryToken = credential.contentDeliveryApiAccessToken as string;
  const previewToken = credential.contentPreviewApiAccessToken as string;
  const api = (credential.api as string) ?? "delivery";

  if (!spaceId || (!deliveryToken && !previewToken)) {
    throw new Error("Contentful: spaceId and at least one access token are required");
  }

  const token = api === "preview" ? previewToken : deliveryToken;
  const baseUrl = api === "preview" ? CPA_BASE : CDA_BASE;

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      if (resource === "space" && operation === "get") {
        result = await getSpace(spaceId, token, baseUrl);
      } else if (operation === "get") {
        result = await getSingle(ctx, resource, spaceId, token, baseUrl);
      } else if (operation === "getAll") {
        result = await getAll(ctx, resource, spaceId, token, baseUrl);
      } else {
        throw new Error(`Contentful: unsupported resource/operation: ${resource}/${operation}`);
      }

      const itemsOut = Array.isArray(result) ? result : [result];
      for (const r of itemsOut) {
        out.push({
          json: r as Record<string, unknown>,
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      }
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

async function contentfulFetch(
  url: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  if (!res.ok) {
    throw new Error(
      `Contentful API: HTTP ${res.status}${body ? `: ${JSON.stringify(body).slice(0, 300)}` : ""}`,
    );
  }
  return { status: res.status, body };
}

function envPath(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): string {
  const env = ctx.getParam<string>("environmentId", "master");
  return `/environments/${encodeURIComponent(env)}`;
}

function buildQuery(
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
  resource: string,
): string {
  const additional = ctx.getParam<Record<string, unknown>>("additionalFields", {});
  const parts: string[] = [];

  if (additional.query) parts.push(`query=${encodeURIComponent(String(additional.query))}`);
  if (additional.order) parts.push(`order=${encodeURIComponent(String(additional.order))}`);
  if (additional.select) parts.push(`select=${encodeURIComponent(String(additional.select))}`);
  if (additional.content_type && resource === "entry") {
    parts.push(`content_type=${encodeURIComponent(String(additional.content_type))}`);
  }
  if (additional.equal) parts.push(`${String(additional.equal)}`);
  if (additional.notEqual) parts.push(`${String(additional.notEqual)}`);
  if (additional.include) parts.push(`${String(additional.include)}`);
  if (additional.exclude) parts.push(`${String(additional.exclude)}`);
  if (additional.exist) parts.push(`${String(additional.exist)}`);

  const returnAll = ctx.getParam<boolean>("returnAll", false);
  if (!returnAll) {
    const rawLimit = ctx.getParam<number>("limit", 100);
    if (rawLimit > 0) {
      parts.push(`limit=${Math.min(Math.max(1, rawLimit), 500)}`);
    }
  }

  const searchParams = ctx.getParam<Record<string, unknown>>("search_parameters", {});
  const paramsArray = (searchParams?.parameters as Array<Record<string, string>>) ?? [];
  for (const p of paramsArray) {
    if (p.key && p.value !== undefined) {
      parts.push(`${encodeURIComponent(p.key)}=${encodeURIComponent(String(p.value))}`);
    }
  }

  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

async function getSpace(
  spaceId: string,
  token: string,
  baseUrl: string,
): Promise<unknown> {
  const url = `${baseUrl}/spaces/${encodeURIComponent(spaceId)}`;
  const { body } = await contentfulFetch(url, token);
  return body;
}

async function getSingle(
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
  resource: string,
  spaceId: string,
  token: string,
  baseUrl: string,
): Promise<unknown> {
  const ep = envPath(ctx);
  let idParam: string;
  let pathSegment: string;

  switch (resource) {
    case "entry":
      idParam = "entryId";
      pathSegment = "entries";
      break;
    case "asset":
      idParam = "assetId";
      pathSegment = "assets";
      break;
    case "contentType":
      idParam = "contentTypeId";
      pathSegment = "content_types";
      break;
    default:
      throw new Error(`Contentful: unsupported resource for get: ${resource}`);
  }

  const id = ctx.getParam<string>(idParam, "");
  if (!id) throw new Error(`Contentful: ${idParam} is required`);

  const url = `${baseUrl}/spaces/${encodeURIComponent(spaceId)}${ep}/${pathSegment}/${encodeURIComponent(id)}`;
  const { body } = await contentfulFetch(url, token);

  const additional = ctx.getParam<Record<string, unknown>>("additionalFields", {});
  if (additional.rawData) {
    return body;
  }
  return body;
}

async function getAll(
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
  resource: string,
  spaceId: string,
  token: string,
  baseUrl: string,
): Promise<unknown> {
  const ep = envPath(ctx);

  let pathSegment: string;
  switch (resource) {
    case "entry":
      pathSegment = "entries";
      break;
    case "asset":
      pathSegment = "assets";
      break;
    case "locale":
      pathSegment = "locales";
      break;
    default:
      throw new Error(`Contentful: unsupported resource for getAll: ${resource}`);
  }

  const additional = ctx.getParam<Record<string, unknown>>("additionalFields", {});
  const returnAll = ctx.getParam<boolean>("returnAll", false);
  const rawData = !!additional.rawData;
  const pageSize = returnAll ? 1000 : Math.min(Math.max(1, ctx.getParam<number>("limit", 100)), 500);

  const baseUrlPath = `${baseUrl}/spaces/${encodeURIComponent(spaceId)}${ep}/${pathSegment}`;
  const qs = buildQuery(ctx, resource);

  if (!returnAll) {
    const url = `${baseUrlPath}${qs}`;
    const { body } = await contentfulFetch(url, token);
    const data = body as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return [];
    if (rawData) return [{ raw: data }];
    return (data as { items?: unknown[] }).items ?? [];
  }

  // returnAll: paginate with skip/limit
  let allItems: unknown[] = [];
  let total = 0;
  let lastEnvelope: Record<string, unknown> | null = null;
  const separator = qs.includes("?") ? "&" : "?";

  while (true) {
    const paginatedQs = `${qs}${separator}skip=${allItems.length}&limit=${pageSize}`;
    const url = `${baseUrlPath}${paginatedQs}`;
    const { body } = await contentfulFetch(url, token);
    const data = body as Record<string, unknown> | null;
    if (!data || typeof data !== "object") break;

    const envelopeTotal = (data as { total?: number }).total ?? 0;
    if (total === 0) total = envelopeTotal;
    lastEnvelope = data;
    const items = (data as { items?: unknown[] }).items ?? [];
    allItems.push(...items);

    if (allItems.length >= total) break;
    if (items.length < pageSize && total === 0) break;
    if (items.length === 0) break;
  }

  if (rawData && lastEnvelope) {
    (lastEnvelope as Record<string, unknown>).items = allItems;
    return [{ raw: lastEnvelope }];
  }

  return allItems;
}
