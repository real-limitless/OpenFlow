import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const API_BASE = "https://actionnetwork.org/api/v2";

export const actionNetworkToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "Person");
  const operation = ctx.getParam<string>("operation", "Create");
  const continueOnFail = ctx.continueOnFail();
  const returnAll = ctx.getParam<boolean>("returnAll", false);
  const limit = ctx.getParam<number>("limit", 25);
  const options = ctx.getParam<Record<string, unknown>>("options", {});

  const credential = await ctx.getCredential("actionNetworkApi");
  const apiKey =
    credential && typeof credential === "object" && "apiKey" in credential
      ? (credential as Record<string, unknown>).apiKey
      : undefined;
  const authHeader: Record<string, string> = apiKey
    ? { Authorization: `Basic ${btoa(`${apiKey}:`)}` }
    : {};

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      const resourcePath = resourceToPath(resource);
      if (!resourcePath) {
        throw new Error(`Action Network Tool: unknown resource "${resource}"`);
      }

      const resolvedParams = resolveParams(ctx, item, i);

      if (operation === "Get") {
        const id = resolvedParams["eventId"] ?? resolvedParams["personId"] ?? resolvedParams["petitionId"] ?? resolvedParams["tagId"];
        if (!id) {
          throw new Error(`Action Network Tool: ID required for Get operation on ${resource}`);
        }
        result = await apiRequest("GET", `${resourcePath}/${encodeURIComponent(String(id))}`, authHeader);
      } else if (operation === "GetAll") {
        const perPage = (options?.perPage as number) ?? (returnAll ? 100 : Math.min(limit, 100));
        const url = `${resourcePath}?per_page=${perPage}`;
        result = await apiRequest("GET", url, authHeader);
      } else if (operation === "Create") {
        const body = buildCreateBody(resource, resolvedParams);
        result = await apiRequest("POST", resourcePath, authHeader, body);
      } else if (operation === "Update") {
        const id = resolvedParams["personId"] ?? resolvedParams["petitionId"];
        if (!id) {
          throw new Error(`Action Network Tool: ID required for Update operation on ${resource}`);
        }
        const body = buildCreateBody(resource, resolvedParams);
        result = await apiRequest("PUT", `${resourcePath}/${encodeURIComponent(String(id))}`, authHeader, body);
      } else if (operation === "Add" && resource === "PersonTag") {
        const personId = resolvedParams["personId"];
        const tagId = resolvedParams["tagId"];
        if (!personId || !tagId) {
          throw new Error("Action Network Tool: personId and tagId required for Person Tag Add");
        }
        result = await apiRequest("POST", `people/${encodeURIComponent(String(personId))}/taggings`, authHeader, { _links: { "osdi:tag": { href: `${API_BASE}/tags/${encodeURIComponent(String(tagId))}` } } });
      } else if (operation === "Remove" && resource === "PersonTag") {
        const personId = resolvedParams["personId"];
        const tagId = resolvedParams["tagId"];
        if (!personId || !tagId) {
          throw new Error("Action Network Tool: personId and tagId required for Person Tag Remove");
        }
        result = await apiRequest("DELETE", `people/${encodeURIComponent(String(personId))}/taggings/${encodeURIComponent(String(tagId))}`, authHeader);
      } else {
        throw new Error(`Action Network Tool: unsupported resource/operation combination: ${resource}/${operation}`);
      }

      out.push({
        json: result as Record<string, unknown>,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
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

function resourceToPath(resource: string): string | null {
  const map: Record<string, string> = {
    Attendance: "attendances",
    Event: "events",
    Person: "people",
    PersonTag: "people",
    Petition: "petitions",
    Signature: "signatures",
    Tag: "tags",
  };
  return map[resource] ?? null;
}

function resolveParams(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  idx: number,
): Record<string, unknown> {
  const allParams = ctx.getParams();
  const resolved: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(allParams)) {
    if (typeof val === "string" && val.startsWith("={{") && val.endsWith("}}")) {
      resolved[key] = ctx.evaluate(val, item.json);
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

function buildCreateBody(resource: string, params: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (resource === "Person") {
    if (params["email"]) body.email_addresses = [{ address: params["email"] }];
    if (params["givenName"]) body.given_name = params["givenName"];
    if (params["familyName"]) body.family_name = params["familyName"];
  } else if (resource === "Event") {
    if (params["title"]) body.title = params["title"];
    if (params["originSystem"]) body.origin_system = params["originSystem"];
  } else if (resource === "Petition") {
    if (params["title"]) body.title = params["title"];
    if (params["originSystem"]) body.origin_system = params["originSystem"];
  } else if (resource === "Tag") {
    if (params["name"]) body.name = params["name"];
  } else if (resource === "Attendance") {
    if (params["personId"]) body._links = { "osdi:person": { href: `${API_BASE}/people/${encodeURIComponent(String(params["personId"]))}` } };
  } else if (resource === "Signature") {
    if (params["person"]) body.person = params["person"];
    if (params["email"]) body.email_addresses = [{ address: params["email"] }];
  }
  return body;
}

async function apiRequest(
  method: string,
  path: string,
  auth: Record<string, string>,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = path.startsWith("http") ? path : `${API_BASE}/${path}`;
  const headers: Record<string, string> = {
    accept: "application/json",
    "OSDI-API-Token": auth.Authorization ?? "",
    ...auth,
  };

  const fetchOptions: RequestInit = { method, headers };

  if (body) {
    headers["content-type"] = "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    let errorText = "";
    try {
      errorText = await res.text();
    } catch {
      errorText = res.statusText ?? "";
    }
    throw new Error(`Action Network API: HTTP ${res.status} ${errorText || res.statusText}`.trim());
  }

  if (res.status === 204) {
    return { success: true };
  }

  const data = (await res.json()) as Record<string, unknown>;

  if (Array.isArray(data?._embedded?.items)) {
    const itemsArr = data._embedded.items as Record<string, unknown>[];
    if (!body?.returnAll && itemsArr.length > 0) {
      return { results: itemsArr };
    }
    return { results: itemsArr, total: data.total_items ?? itemsArr.length };
  }

  return data;
}
