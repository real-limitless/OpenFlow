import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

function resolveParam(
  ctx: ExecutionContext,
  name: string,
  itemJson: Record<string, unknown>,
): unknown {
  const raw = ctx.getParam(name);
  if (typeof raw === "string" && raw.startsWith("={{") && raw.endsWith("}}")) {
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function mispRequest(
  baseUrl: string,
  authHeader: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const headers: Record<string, string> = {
      Authorization: authHeader,
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`MISP request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function buildPath(resource: string, operation: string, params: Record<string, unknown>): string {
  const id = params[`${resource}Id`];
  switch (resource) {
    case "attribute":
      if (operation === "search") return "/attributes/restSearch";
      if (operation === "create" || operation === "getAll") return "/attributes";
      if (id) return `/attributes/${encodeURIComponent(String(id))}`;
      return "/attributes";
    case "event":
      if (operation === "search") return "/events/restSearch";
      if (operation === "publish" && id) return `/events/publish/${encodeURIComponent(String(id))}`;
      if (operation === "unpublish" && id) return `/events/unpublish/${encodeURIComponent(String(id))}`;
      if (id) return `/events/${encodeURIComponent(String(id))}`;
      return "/events";
    case "eventTag": {
      const eId = params.eventId;
      const tId = params.tagId;
      if (operation === "add" && eId && tId) return `/events/addTag/${encodeURIComponent(String(eId))}/${encodeURIComponent(String(tId))}`;
      if (operation === "remove" && eId && tId) return `/events/removeTag/${encodeURIComponent(String(eId))}/${encodeURIComponent(String(tId))}`;
      return "/events";
    }
    case "feed":
      if (operation === "enable" && id) return `/feeds/enable/${encodeURIComponent(String(id))}`;
      if (operation === "disable" && id) return `/feeds/disable/${encodeURIComponent(String(id))}`;
      if (id) return `/feeds/${encodeURIComponent(String(id))}`;
      return "/feeds";
    case "galaxy":
      if (id) return `/galaxies/${encodeURIComponent(String(id))}`;
      return "/galaxies";
    case "noticelist":
      return "/noticelists";
    case "object":
      return "/objects/restSearch";
    case "organisation":
      if (id) return `/organisations/${encodeURIComponent(String(id))}`;
      return "/organisations";
    case "tag":
      if (id) return `/tags/${encodeURIComponent(String(id))}`;
      return "/tags";
    case "user":
      if (id) return `/users/${encodeURIComponent(String(id))}`;
      return "/users";
    case "warninglist":
      return "/warninglists";
    default:
      return `/${resource}s`;
  }
}

function buildBody(resource: string, operation: string, params: Record<string, unknown>, itemJson: Record<string, unknown>): Record<string, unknown> | undefined {
  if (operation === "get" || operation === "getAll" || operation === "delete" || operation === "enable" || operation === "disable") return undefined;

  if (resource === "event" && operation === "create") {
    const event: Record<string, unknown> = {};
    if (params.info) event.info = params.info;
    if (params.date) event.date = params.date;
    if (params.analysis) event.analysis = params.analysis;
    if (params.threatLevelId) event.threat_level_id = params.threatLevelId;
    if (params.distribution) event.distribution = params.distribution;
    const af = params.additionalFields as Record<string, unknown> | undefined;
    if (af?.sharingGroupId) event.sharing_group_id = af.sharingGroupId;
    if (af?.published) event.published = af.published;
    return { Event: event };
  }

  if (resource === "attribute" && operation === "create") {
    const attr: Record<string, unknown> = {};
    if (params.eventId) attr.event_id = params.eventId;
    if (params.type) attr.type = params.type;
    if (params.value) attr.value = params.value;
    if (params.category) attr.category = params.category;
    return { Attribute: attr };
  }

  if (resource === "eventTag" && operation === "add") {
    return { Event: { id: params.eventId }, Tag: { id: params.tagId } };
  }

  if (resource === "organisation" && operation === "create") {
    const org: Record<string, unknown> = {};
    if (params.name) org.name = params.name;
    return { Organisation: org };
  }

  if (resource === "tag" && operation === "create") {
    const tag: Record<string, unknown> = {};
    if (params.name) tag.name = params.name;
    if (params.colour) tag.colour = params.colour;
    return { Tag: tag };
  }

  if (resource === "user" && operation === "create") {
    const user: Record<string, unknown> = {};
    if (params.email) user.email = params.email;
    if (params.roleId) user.role_id = params.roleId;
    return { User: user };
  }

  if (resource === "feed" && operation === "create") {
    const feed: Record<string, unknown> = {};
    if (params.name) feed.name = params.name;
    if (params.url) feed.url = params.url;
    if (params.sourceFormat) feed.source_format = params.sourceFormat;
    return { Feed: feed };
  }

  if (operation === "search") {
    const search: Record<string, unknown> = {};
    if (params.tags) {
      const tags = Array.isArray(params.tags) ? params.tags : String(params.tags).split(",").map((t) => t.trim());
      search.tags = tags;
    }
    if (params.value) search.value = params.value;
    if (params.type) search.type = params.type;
    if (params.eventId) search.eventid = params.eventId;
    return search;
  }

  return undefined;
}

function findEntry(src: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = src[k];
    if (v !== undefined) return v;
  }
  return undefined;
}

function buildMethod(operation: string, resource: string): string {
  switch (operation) {
    case "create":
      return "POST";
    case "update":
      return "PUT";
    case "delete":
      return "DELETE";
    case "publish":
    case "unpublish":
    case "enable":
    case "disable":
    case "add":
    case "remove":
      return "POST";
    default:
      if (operation === "search") return "POST";
      return "GET";
  }
}

export const mispToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "event");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("mispApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const baseUrl = cred ? String(cred.baseUrl ?? cred.url ?? "") : "";
  if (!apiKey || !baseUrl) {
    throw new Error("MISP Tool: mispApi credential is not configured (apiKey + baseUrl required)");
  }
  const authHeader = apiKey;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const params: Record<string, unknown> = {};
      const rawParams = ctx.getParams();
      for (const [k, v] of Object.entries(rawParams)) {
        if (k === "resource" || k === "operation") continue;
        params[k] = resolveParam(ctx, k, itemJson);
      }

      const method = buildMethod(operation, resource);
      const path = buildPath(resource, operation, params);
      const body = buildBody(resource, operation, params, itemJson);

      const res = await mispRequest(baseUrl, authHeader, method, path, body);
      if (res.status < 200 || res.status >= 300) {
        const obj = asObj(res.body);
        const errMsg = String((obj as Record<string, unknown>).message ?? (obj as Record<string, unknown>).error ?? `HTTP ${res.status}`);
        throw new Error(`MISP API error: ${errMsg}`);
      }

      const payload = asObj(res.body);
      const responseKey = resource.toLowerCase();
      const result: Record<string, unknown> = {};
      const capitalized = resource.charAt(0).toUpperCase() + resource.slice(1);
      const pluralized = `${capitalized}s`;

      if (operation === "getAll" || operation === "search") {
        const response = payload.response as Record<string, unknown> | undefined;
        const nested = response ? findEntry(response, [capitalized, pluralized, resource]) : undefined;
        const list = nested ?? findEntry(payload, [capitalized, pluralized, resource]);
        result[responseKey] = Array.isArray(list) ? list : (list !== undefined ? [list] : [payload]);
      } else if (operation === "delete") {
        result[responseKey] = { message: `${resource} deleted successfully` };
      } else {
        const entry = findEntry(payload, [capitalized, resource]);
        result[responseKey] = entry ? asObj(entry as Record<string, unknown>) : payload;
      }

      out.push({ json: result, pairedItem });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem,
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};
