import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

const CLOUD_API_BASE = "https://api.taiga.io/api/v1";

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

function buildBody(fields: Record<string, unknown> | string | undefined, itemJson: Record<string, unknown>): Record<string, unknown> {
  const raw = resolveValue(fields, itemJson);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      obj[key] = resolveValue(obj[key], itemJson);
    }
    return obj;
  }
  return {};
}

async function authenticate(cred: Record<string, unknown>): Promise<{ token: string; url: string }> {
  const username = String(cred.username ?? "");
  const password = String(cred.password ?? "");
  const environment = String(cred.environment ?? "cloud");
  const baseUrl = environment === "selfHosted" && cred.url
    ? String(cred.url).replace(/\/+$/, "")
    : CLOUD_API_BASE;

  const res = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, type: "normal" }),
  });
  if (!res.ok) {
    throw new Error(`Taiga auth failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as Record<string, unknown>;
  return { token: String(data.auth_token ?? ""), url: baseUrl };
}

function resourceEndpoint(resource: string): string {
  const map: Record<string, string> = {
    epic: "epics",
    issue: "issues",
    task: "tasks",
    userStory: "userstories",
  };
  return map[resource] ?? resource;
}

async function apiRequest(
  method: string,
  baseUrl: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    init.body = JSON.stringify(body);
  }
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "unknown");
    throw new Error(`Taiga API error: ${res.status} ${res.statusText} — ${errorBody}`);
  }
  if (res.status === 204 || method === "DELETE") {
    return { success: true };
  }
  return res.json().catch(() => ({}));
}

export const taigaExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const outputs: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    try {
      const item = items[idx];
      const itemJson = item.json ?? {};
      const resource = String(ctx.getParam("resource") ?? "issue");
      const operation = String(ctx.getParam("operation") ?? "create");

      const cred = await ctx.getCredential("taigaApi");
      if (!cred) {
        throw new Error("Taiga: No credential found. Configure taigaApi.");
      }
      const { token, url: baseUrl } = await authenticate(cred as Record<string, unknown>);
      const endpoint = resourceEndpoint(resource);

      if (operation === "create") {
        const projectId = resolveValue(ctx.getParam("projectId"), itemJson);
        const subject = resolveValue(ctx.getParam("subject"), itemJson);
        if (!projectId) throw new Error("Taiga: projectId is required for create");
        if (!subject) throw new Error("Taiga: subject is required for create");
        const body: Record<string, unknown> = {
          project: Number(projectId),
          subject: String(subject),
        };
        const additionalFields = buildBody(ctx.getParam("additionalFields"), itemJson);
        Object.assign(body, additionalFields);
        const result = await apiRequest("POST", baseUrl, `/${endpoint}`, token, body);
        outputs.push({ json: result as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (operation === "get") {
        const idKey = `${resource}Id`;
        const rawId = resolveValue(ctx.getParam(idKey), itemJson);
        if (!rawId) throw new Error(`Taiga: ${idKey} is required for get`);
        const result = await apiRequest("GET", baseUrl, `/${endpoint}/${rawId}`, token);
        outputs.push({ json: result as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (operation === "getAll") {
        const projectId = resolveValue(ctx.getParam("projectId"), itemJson);
        const filters = buildBody(ctx.getParam("filters"), itemJson);
        const qsParts: string[] = [];
        if (projectId) qsParts.push(`project=${Number(projectId)}`);
        for (const [key, val] of Object.entries(filters)) {
          if (val !== undefined && val !== null && val !== "") {
            qsParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
          }
        }
        const qs = qsParts.length > 0 ? `?${qsParts.join("&")}` : "";
        const result = await apiRequest("GET", baseUrl, `/${endpoint}${qs}`, token);
        const data = Array.isArray(result) ? result : [];
        outputs.push({ json: data as unknown as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (operation === "update") {
        const idKey = `${resource}Id`;
        const rawId = resolveValue(ctx.getParam(idKey), itemJson);
        if (!rawId) throw new Error(`Taiga: ${idKey} is required for update`);
        const body: Record<string, unknown> = {};
        const projectId = resolveValue(ctx.getParam("projectId"), itemJson);
        if (projectId) body.project = Number(projectId);
        const updateFields = buildBody(ctx.getParam("updateFields"), itemJson);
        Object.assign(body, updateFields);
        const result = await apiRequest("PATCH", baseUrl, `/${endpoint}/${rawId}`, token, body);
        outputs.push({ json: result as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (operation === "delete") {
        const idKey = `${resource}Id`;
        const rawId = resolveValue(ctx.getParam(idKey), itemJson);
        if (!rawId) throw new Error(`Taiga: ${idKey} is required for delete`);
        const result = await apiRequest("DELETE", baseUrl, `/${endpoint}/${rawId}`, token);
        outputs.push({ json: result as Record<string, unknown>, pairedItem: { item: idx } });
      } else {
        throw new Error(`Taiga: unsupported operation ${operation}`);
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
