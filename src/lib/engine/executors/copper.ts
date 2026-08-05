import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { sdkHttpRequest } from "@/sdk";
import { evaluateOnItem } from "@/sdk/helpers/expressions";

const API_BASE = "https://api.copper.com/developer_api/v1";

function resolveExpressions(value: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof value !== "string") return value;
  if (value.startsWith("=") || value.includes("{{")) {
    const result = evaluateOnItem(value, itemJson);
    return result;
  }
  return value;
}

function resolveAdditionalFields(
  fields: Record<string, unknown> | undefined,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const resolved = resolveExpressions(v, itemJson);
    if (k === "tags" && typeof resolved === "string") {
      out[k] = resolved.split(",").map((s: string) => s.trim()).filter(Boolean);
    } else if (k === "custom_fields" && typeof resolved === "string") {
      try { out[k] = JSON.parse(resolved); } catch { out[k] = resolved; }
    } else if (["address", "email", "phone_numbers", "socials", "websites"].includes(k) && typeof resolved === "string") {
      try { out[k] = JSON.parse(resolved); } catch { out[k] = resolved; }
    } else {
      out[k] = resolved;
    }
  }
  return out;
}

function entityEndpoint(resource: string): string {
  const map: Record<string, string> = {
    Company: "companies",
    CustomerSource: "customer_sources",
    Lead: "leads",
    Opportunity: "opportunities",
    Person: "people",
    Project: "projects",
    Task: "tasks",
    User: "users",
  };
  return map[resource] ?? "";
}

function entityIdParam(resource: string): string {
  const map: Record<string, string> = {
    Company: "companyId",
    Lead: "leadId",
    Opportunity: "opportunityId",
    Person: "personId",
    Project: "projectId",
    Task: "taskId",
  };
  return map[resource] ?? "";
}

export const copperExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();
  const operation = String(node.parameters.operation ?? "Create");
  const isGetAll = operation === "GetAll";

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, itemJson);
      if (isGetAll) {
        out.push({ json: result as Record<string, unknown>, pairedItem });
      } else {
        const list = Array.isArray(result) ? result : [result];
        for (const r of list) {
          out.push({ json: r, pairedItem });
        }
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof Error && "status" in err ? (err as any).status : 500;
      out.push({ json: { error: { message, statusCode } }, pairedItem });
    }
  }

  return [out];
};

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("copperApi");
  if (!cred) {
    throw new Error("Copper: copperApi credential is not configured");
  }
  const apiKey = String(cred.apiKey ?? "");
  const email = String(cred.email ?? "");
  if (!apiKey || !email) {
    throw new Error("Copper: apiKey and email are required in copperApi credential");
  }
  return {
    "X-Authorization": `Token ${apiKey}`,
    "X-User-Email": email,
    "Content-Type": "application/json",
  };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const resource = String(node.parameters.resource ?? "Company");
  const operation = String(node.parameters.operation ?? "Create");
  const headers = await getAuthHeaders(ctx);
  const endpoint = entityEndpoint(resource);

  if (operation === "GetAll") {
    if (resource === "CustomerSource") {
      const res = await sdkHttpRequest({
        method: "GET",
        url: `${API_BASE}/customer_sources`,
        headers,
      });
      return res.body as Record<string, unknown>[];
    }
    if (resource === "User") {
      const options = (node.parameters.options ?? {}) as Record<string, unknown>;
      const resolvedOptions: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(options)) {
        resolvedOptions[k] = resolveExpressions(v, itemJson);
      }

      let allUsers: Record<string, unknown>[] = [];
      let page = Number(resolvedOptions.page_number ?? 1);
      const pageSize = Number(resolvedOptions.page_size ?? 200);
      const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
      const limit = Number(node.parameters.limit ?? 50);

      const body: Record<string, unknown> = {
        page_size: Math.min(pageSize, 200),
        page_number: page,
      };
      if (resolvedOptions.sort_by) {
        body.sort_by = resolvedOptions.sort_by;
        body.sort_direction = resolvedOptions.sort_direction ?? "asc";
      }
      if (resolvedOptions.filter && typeof resolvedOptions.filter === "object") {
        Object.assign(body, resolvedOptions.filter);
      } else if (typeof resolvedOptions.filter === "string") {
        try { Object.assign(body, JSON.parse(resolvedOptions.filter)); } catch {}
      }

      const res = await sdkHttpRequest({
        method: "POST",
        url: `${API_BASE}/users/search`,
        headers,
        body,
      });
      const data = Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
      allUsers = data;

      if (!returnAll && allUsers.length > limit) {
        allUsers = allUsers.slice(0, limit);
      }
      return allUsers;
    }

    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const resolvedOptions: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(options)) {
      resolvedOptions[k] = resolveExpressions(v, itemJson);
    }

    let allItems: Record<string, unknown>[] = [];
    let page = Number(resolvedOptions.page_number ?? 1);
    const pageSize = Number(resolvedOptions.page_size ?? 200);
    const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
    const limit = Number(node.parameters.limit ?? 50);

    const body: Record<string, unknown> = {
      page_size: Math.min(pageSize, 200),
      page_number: page,
    };
    if (resolvedOptions.sort_by) {
      body.sort_by = resolvedOptions.sort_by;
      body.sort_direction = resolvedOptions.sort_direction ?? "asc";
    }
    if (resolvedOptions.filter && typeof resolvedOptions.filter === "object") {
      Object.assign(body, resolvedOptions.filter);
    } else if (typeof resolvedOptions.filter === "string") {
      try { Object.assign(body, JSON.parse(resolvedOptions.filter)); } catch {}
    }

    const res = await sdkHttpRequest({
      method: "POST",
      url: `${API_BASE}/${endpoint}/search`,
      headers,
      body,
    });
    const data = Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
    allItems = data;

    if (!returnAll && allItems.length > limit) {
      allItems = allItems.slice(0, limit);
    }
    return allItems;
  }

  async function apiCall(opts: { method: string; url: string; body?: unknown }) {
    const res = await sdkHttpRequest({
      method: opts.method,
      url: opts.url,
      headers,
      body: opts.body,
    });
    if (res.status < 200 || res.status >= 300) {
      const msg = typeof res.body === "object" && res.body !== null && "error" in (res.body as any)
        ? (res.body as any).error
        : `Copper API returned ${res.status}`;
      throw Object.assign(new Error(String(msg)), { status: res.status });
    }
    return res.body;
  }

  if (operation === "Get") {
    const idParam = entityIdParam(resource);
    const rawId = String(resolveExpressions(node.parameters[idParam], itemJson) ?? "");
    if (!rawId) throw new Error(`Copper: ${idParam} is required for Get operation`);
    const res = await apiCall({ method: "GET", url: `${API_BASE}/${endpoint}/${rawId}` });
    return res as Record<string, unknown>;
  }

  if (operation === "Create") {
    const rawFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const fields = resolveAdditionalFields(rawFields, itemJson);
    const res = await apiCall({ method: "POST", url: `${API_BASE}/${endpoint}`, body: fields });
    return res as Record<string, unknown>;
  }

  if (operation === "Update") {
    const idParam = entityIdParam(resource);
    const rawId = String(resolveExpressions(node.parameters[idParam], itemJson) ?? "");
    if (!rawId) throw new Error(`Copper: ${idParam} is required for Update operation`);
    const rawFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const fields = resolveAdditionalFields(rawFields, itemJson);
    const res = await apiCall({ method: "PUT", url: `${API_BASE}/${endpoint}/${rawId}`, body: fields });
    return res as Record<string, unknown>;
  }

  if (operation === "Delete") {
    const idParam = entityIdParam(resource);
    const rawId = String(resolveExpressions(node.parameters[idParam], itemJson) ?? "");
    if (!rawId) throw new Error(`Copper: ${idParam} is required for Delete operation`);
    const res = await apiCall({ method: "DELETE", url: `${API_BASE}/${endpoint}/${rawId}` });
    return res as Record<string, unknown>;
  }

  throw new Error(`Copper: unsupported resource/operation "${resource}/${operation}"`);
}
