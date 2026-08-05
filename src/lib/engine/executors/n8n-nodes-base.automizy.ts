import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

const API_BASE = "https://api.automizy.com/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", "return " + raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1"));
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function apiRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "unknown");
    throw new Error(`Automizy API error: ${res.status} ${res.statusText} — ${errorBody}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return { success: true };
  }
  return res.json().catch(() => ({}));
}

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("automizyApi");
  if (cred) {
    const data = cred as Record<string, unknown>;
    const apiKey = String(data.apiKey ?? "");
    if (apiKey) return apiKey;
  }
  throw new Error("Automizy: No valid credential found. Configure automizyApi with an apiKey.");
}

export const automizyExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const outputs: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    try {
      const item = items[idx];
      const itemJson = item.json ?? {};
      const resource = String(ctx.getParam("resource") ?? "contact");
      const operation = String(ctx.getParam("operation") ?? "create");
      const apiKey = await getApiKey(ctx);

      if (resource === "contact" && operation === "create") {
        const email = String(resolveValue(ctx.getParam("email"), itemJson) ?? "");
        const listId = String(resolveValue(ctx.getParam("listId"), itemJson) ?? "");
        if (!email) {
          throw new Error("Automizy: required parameter 'email' is missing for contact create");
        }
        const body: Record<string, unknown> = { email };
        if (listId) body.listId = listId;
        const firstName = resolveValue(ctx.getParam("firstName"), itemJson);
        if (firstName) body.firstName = firstName;
        const lastName = resolveValue(ctx.getParam("lastName"), itemJson);
        if (lastName) body.lastName = lastName;
        const customFields = resolveValue(ctx.getParam("customFields"), itemJson);
        if (customFields) body.customFields = customFields;
        const tagIds = resolveValue(ctx.getParam("tagIds"), itemJson);
        if (tagIds) body.tagIds = tagIds;
        const additionalFields = resolveValue(ctx.getParam("additionalFields"), itemJson);
        if (additionalFields && typeof additionalFields === "object") {
          Object.assign(body, additionalFields);
        }
        const result = await apiRequest("POST", "/contacts", apiKey, body);
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "contact" && operation === "update") {
        const email = String(resolveValue(ctx.getParam("email"), itemJson) ?? "");
        const listId = String(resolveValue(ctx.getParam("listId"), itemJson) ?? "");
        if (!email) {
          throw new Error("Automizy: required parameter 'email' is missing for contact update");
        }
        const body: Record<string, unknown> = {};
        if (listId) body.listId = listId;
        const firstName = resolveValue(ctx.getParam("firstName"), itemJson);
        if (firstName) body.firstName = firstName;
        const lastName = resolveValue(ctx.getParam("lastName"), itemJson);
        if (lastName) body.lastName = lastName;
        const customFields = resolveValue(ctx.getParam("customFields"), itemJson);
        if (customFields) body.customFields = customFields;
        const tagIds = resolveValue(ctx.getParam("tagIds"), itemJson);
        if (tagIds) body.tagIds = tagIds;
        const additionalFields = resolveValue(ctx.getParam("additionalFields"), itemJson);
        if (additionalFields && typeof additionalFields === "object") {
          Object.assign(body, additionalFields);
        }
        const result = await apiRequest("PATCH", `/contacts/${encodeURIComponent(email)}`, apiKey, body);
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "contact" && operation === "get") {
        const email = String(resolveValue(ctx.getParam("email"), itemJson) ?? "");
        if (!email) {
          throw new Error("Automizy: required parameter 'email' is missing for contact get");
        }
        const result = await apiRequest("GET", `/contacts/${encodeURIComponent(email)}`, apiKey);
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "contact" && operation === "getAll") {
        const listId = String(resolveValue(ctx.getParam("listId"), itemJson) ?? "");
        const qs = listId ? `?listId=${encodeURIComponent(listId)}` : "";
        const result = await apiRequest("GET", `/contacts${qs}`, apiKey);
        const data = Array.isArray(result.contacts) ? result.contacts : (Array.isArray(result.data) ? result.data : []);
        outputs.push({ json: { contacts: data }, pairedItem: { item: idx } });
      } else if (resource === "contact" && operation === "delete") {
        const email = String(resolveValue(ctx.getParam("email"), itemJson) ?? "");
        if (!email) {
          throw new Error("Automizy: required parameter 'email' is missing for contact delete");
        }
        const result = await apiRequest("DELETE", `/contacts/${encodeURIComponent(email)}`, apiKey);
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "list" && operation === "getAll") {
        const result = await apiRequest("GET", "/lists", apiKey);
        const data = Array.isArray(result.lists) ? result.lists : (Array.isArray(result.data) ? result.data : []);
        outputs.push({ json: { lists: data }, pairedItem: { item: idx } });
      } else if (resource === "email" && operation === "create") {
        const result = await apiRequest("POST", "/emails", apiKey);
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "tag" && operation === "getAll") {
        const result = await apiRequest("GET", "/tags", apiKey);
        const data = Array.isArray(result.tags) ? result.tags : (Array.isArray(result.data) ? result.data : []);
        outputs.push({ json: { tags: data }, pairedItem: { item: idx } });
      } else {
        outputs.push({
          json: { error: `Automizy: unsupported resource/operation: ${resource}/${operation}` },
          pairedItem: { item: idx },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (ctx.continueOnFail()) {
        outputs.push({ json: { error: message } as Record<string, unknown>, pairedItem: { item: idx } });
      } else {
        throw err;
      }
    }
  }

  if (outputs.length === 0) {
    return [[{ json: {} }]];
  }
  return [outputs];
};
