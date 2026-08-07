import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const BASE_URL = "https://api.kitemaker.co/rest/v1";

function getParam(node: { parameters: Record<string, unknown> }, name: string, def?: string): string {
  return String(node.parameters[name] ?? def ?? "");
}

async function getAuthHeaders(ctx: { getCredential(name: string): Promise<Record<string, unknown> | null> }): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("kitemakerApi");
  if (!cred?.accessToken) {
    throw new Error("Kitemaker Tool: missing credential 'kitemakerApi' with accessToken");
  }
  return { "X-API-KEY": String(cred.accessToken), "Content-Type": "application/json" };
}

async function apiFetch(url: string, headers: Record<string, string>, method = "GET", body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    throw new Error(`Kitemaker API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function handleOrganization(headers: Record<string, string>): Promise<Record<string, unknown>> {
  const data = await apiFetch(`${BASE_URL}/organization`, headers);
  return data;
}

async function handleSpaces(headers: Record<string, string>): Promise<{ json: Record<string, unknown>[] }> {
  const data = await apiFetch(`${BASE_URL}/metadata/spaces`, headers);
  const items = Array.isArray(data) ? data : (data as Record<string, unknown>).items ?? [];
  return { json: items as Record<string, unknown>[] };
}

async function handleUsers(headers: Record<string, string>): Promise<{ json: Record<string, unknown>[] }> {
  const data = await apiFetch(`${BASE_URL}/users`, headers);
  const items = Array.isArray(data) ? data : (data as Record<string, unknown>).items ?? [];
  return { json: items as Record<string, unknown>[] };
}

async function handleCreateWorkItem(node: { parameters: Record<string, unknown> }, headers: Record<string, string>, itemJson: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  const title = getParam(node, "title");
  body.title = title.startsWith("={{") ? itemJson[title.slice(3, -1).replace("$json.", "")] ?? title : title;
  const description = getParam(node, "description");
  if (description) {
    body.description = description.startsWith("={{") ? itemJson[description.slice(3, -1).replace("$json.", "")] ?? description : description;
  }
  const statusId = getParam(node, "statusId");
  if (statusId) body.statusId = statusId;
  const spaceId = getParam(node, "spaceId");
  if (spaceId) body.spaceId = spaceId;
  const effort = getParam(node, "effort");
  if (effort) body.effort = effort;
  const impact = getParam(node, "impact");
  if (impact) body.impact = impact;
  const placement = getParam(node, "placement", "top");
  body.placement = placement;
  const labelIds = getParam(node, "labelIds");
  if (labelIds) body.labelIds = labelIds.split(",").map((s: string) => s.trim()).filter(Boolean);
  const data = await apiFetch(`${BASE_URL}/workitem`, headers, "POST", body);
  return data;
}

async function handleGetWorkItem(node: { parameters: Record<string, unknown> }, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const workItemId = getParam(node, "workItemId");
  const data = await apiFetch(`${BASE_URL}/workitem/${workItemId}`, headers);
  return data;
}

async function handleGetAllWorkItems(node: { parameters: Record<string, unknown> }, headers: Record<string, string>): Promise<{ json: Record<string, unknown>[] }> {
  const spaceId = getParam(node, "spaceId");
  const limit = getParam(node, "limit", "50");
  const returnAll = node.parameters.returnAll === true;
  let url = `${BASE_URL}/metadata/workitems?spaceId=${spaceId}&limit=${limit}`;
  if (returnAll) {
    url = `${BASE_URL}/metadata/workitems?spaceId=${spaceId}`;
  }
  const data = await apiFetch(url, headers);
  const items = Array.isArray(data) ? data : (data as Record<string, unknown>).items ?? [];
  return { json: items as Record<string, unknown>[] };
}

async function handleUpdateWorkItem(node: { parameters: Record<string, unknown> }, headers: Record<string, string>, itemJson: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  const workItemId = getParam(node, "workItemId");
  body.id = workItemId;
  const title = getParam(node, "title");
  if (title) {
    body.title = title.startsWith("={{") ? itemJson[title.slice(3, -1).replace("$json.", "")] ?? title : title;
  }
  const description = getParam(node, "description");
  if (description) {
    body.description = description.startsWith("={{") ? itemJson[description.slice(3, -1).replace("$json.", "")] ?? description : description;
  }
  const statusId = getParam(node, "statusId");
  if (statusId) body.statusId = statusId;
  const effort = getParam(node, "effort");
  if (effort) body.effort = effort;
  const impact = getParam(node, "impact");
  if (impact) body.impact = impact;
  const labelIds = getParam(node, "labelIds");
  if (labelIds) body.labelIds = labelIds.split(",").map((s: string) => s.trim()).filter(Boolean);
  const data = await apiFetch(`${BASE_URL}/workitem`, headers, "PUT", body);
  return data;
}

export const kitemakerToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "workItem");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const headers = await getAuthHeaders(ctx);
      let result: { json: Record<string, unknown> } | { json: Record<string, unknown>[] };

      if (resource === "organization" && operation === "get") {
        result = { json: await handleOrganization(headers) };
      } else if (resource === "space" && operation === "getAll") {
        result = await handleSpaces(headers);
      } else if (resource === "user" && operation === "getAll") {
        result = await handleUsers(headers);
      } else if (resource === "workItem" && operation === "create") {
        result = { json: await handleCreateWorkItem(node, headers, itemJson) };
      } else if (resource === "workItem" && operation === "get") {
        result = { json: await handleGetWorkItem(node, headers) };
      } else if (resource === "workItem" && operation === "getAll") {
        result = await handleGetAllWorkItems(node, headers);
      } else if (resource === "workItem" && operation === "update") {
        result = { json: await handleUpdateWorkItem(node, headers, itemJson) };
      } else {
        throw new Error(`Kitemaker Tool: unsupported resource/operation "${resource}/${operation}"`);
      }

      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message, httpCode: 500 } }, pairedItem });
    }
  }

  return [out];
};
