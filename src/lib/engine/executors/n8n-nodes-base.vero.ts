import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

const API_BASE = "https://api.getvero.com/api/v2";

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
  authToken: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const qs = `?auth_token=${encodeURIComponent(authToken)}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}${qs}`, init);
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "unknown");
    throw new Error(`Vero API error: ${res.status} ${res.statusText} — ${errorBody}`);
  }
  return res.json().catch(() => ({ status: 200, message: "Success." }));
}

async function getAuthToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("veroApi");
  if (cred) {
    const data = cred as Record<string, unknown>;
    const token = String(data.authToken ?? data.apiKey ?? "");
    if (token) return token;
  }
  throw new Error(
    "Vero: No valid credential found. Configure veroApi with an authToken or apiKey.",
  );
}

function buildUserCreateOrUpdateBody(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const id = resolveValue(ctx.getParam("id"), itemJson);
  const email = resolveValue(ctx.getParam("email"), itemJson);
  if (id) body.id = id;
  if (email) body.email = email;
  if (!body.id && !body.email) {
    throw new Error("Vero: required parameter 'id' or 'email' missing for createOrUpdate");
  }
  const data = resolveValue(ctx.getParam("data"), itemJson);
  if (data && typeof data === "object") body.data = data;
  const extras = resolveValue(ctx.getParam("extras"), itemJson);
  if (extras && typeof extras === "object") body.extras = extras;
  return body;
}

export const veroExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const outputs: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    try {
      const item = items[idx];
      const itemJson = item.json ?? {};
      const resource = String(ctx.getParam("resource") ?? "User");
      const operation = String(ctx.getParam("operation") ?? "createOrUpdate");
      const authToken = await getAuthToken(ctx);

      if (resource === "User" && operation === "createOrUpdate") {
        const body = buildUserCreateOrUpdateBody(ctx, itemJson);
        const result = await apiRequest("POST", "/users/track", authToken, body);
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "User" && operation === "alias") {
        const id = String(resolveValue(ctx.getParam("id"), itemJson) ?? "");
        const newId = String(resolveValue(ctx.getParam("newId"), itemJson) ?? "");
        if (!id) throw new Error("Vero: required parameter 'id' missing for alias");
        if (!newId) throw new Error("Vero: required parameter 'newId' missing for alias");
        const body = { id, new_id: newId };
        const result = await apiRequest("PUT", "/users/reidentify", authToken, body);
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "User" && operation === "unsubscribe") {
        const id = String(resolveValue(ctx.getParam("id"), itemJson) ?? "");
        if (!id) throw new Error("Vero: required parameter 'id' missing for unsubscribe");
        const result = await apiRequest("POST", "/users/unsubscribe", authToken, { id });
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "User" && operation === "resubscribe") {
        const id = String(resolveValue(ctx.getParam("id"), itemJson) ?? "");
        if (!id) throw new Error("Vero: required parameter 'id' missing for resubscribe");
        const result = await apiRequest("POST", "/users/resubscribe", authToken, { id });
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "User" && operation === "delete") {
        const id = String(resolveValue(ctx.getParam("id"), itemJson) ?? "");
        if (!id) throw new Error("Vero: required parameter 'id' missing for delete");
        const result = await apiRequest("POST", "/users/delete", authToken, { id });
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "User" && operation === "addTags") {
        const id = String(resolveValue(ctx.getParam("id"), itemJson) ?? "");
        const tags = resolveValue(ctx.getParam("tags"), itemJson);
        if (!id) throw new Error("Vero: required parameter 'id' missing for addTags");
        if (!tags || !Array.isArray(tags)) throw new Error("Vero: required parameter 'tags' (array) missing for addTags");
        const result = await apiRequest("PUT", "/users/tags/edit", authToken, { id, add: tags });
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "User" && operation === "removeTags") {
        const id = String(resolveValue(ctx.getParam("id"), itemJson) ?? "");
        const tags = resolveValue(ctx.getParam("tags"), itemJson);
        if (!id) throw new Error("Vero: required parameter 'id' missing for removeTags");
        if (!tags || !Array.isArray(tags)) throw new Error("Vero: required parameter 'tags' (array) missing for removeTags");
        const result = await apiRequest("PUT", "/users/tags/edit", authToken, { id, remove: tags });
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (resource === "Event" && operation === "track") {
        const eventName = String(resolveValue(ctx.getParam("eventName"), itemJson) ?? "");
        if (!eventName) throw new Error("Vero: required parameter 'eventName' missing for track");
        const body: Record<string, unknown> = { event_name: eventName };
        const identity: Record<string, unknown> = {};
        const identityId = resolveValue(ctx.getParam("identity.id"), itemJson);
        const identityEmail = resolveValue(ctx.getParam("identity.email"), itemJson);
        if (identityId) identity.id = identityId;
        if (identityEmail) identity.email = identityEmail;
        if (Object.keys(identity).length > 0) body.identity = identity;
        const data = resolveValue(ctx.getParam("data"), itemJson);
        if (data && typeof data === "object") body.data = data;
        const extras = resolveValue(ctx.getParam("extras"), itemJson);
        if (extras && typeof extras === "object") body.extras = extras;
        const result = await apiRequest("POST", "/events/track", authToken, body);
        outputs.push({ json: asObj(result) as Record<string, unknown>, pairedItem: { item: idx } });
      } else {
        outputs.push({
          json: { error: `Vero: unsupported resource/operation: ${resource}/${operation}` },
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
