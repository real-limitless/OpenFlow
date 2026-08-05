import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { sdkHttpRequest } from "@/sdk";
import { evaluateOnItem } from "@/sdk/helpers/expressions";

const API_BASE = "https://api.copper.com/developer_api/v1";

function resolveExpressions(value: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof value !== "string") return value;
  if (value.startsWith("=") || value.includes("{{")) {
    return evaluateOnItem(value, itemJson);
  }
  return value;
}

function resolveFields(
  fields: Record<string, unknown> | undefined,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const resolved = resolveExpressions(v, itemJson);
    if (k === "tags" && typeof resolved === "string") {
      out[k] = resolved.split(",").map((s: string) => s.trim()).filter(Boolean);
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
    company: "companies",
    customerSource: "customer_sources",
    lead: "leads",
    opportunity: "opportunities",
    person: "people",
    project: "projects",
    task: "tasks",
    user: "users",
  };
  return map[resource] ?? "";
}

function entityIdParam(resource: string): string {
  const map: Record<string, string> = {
    company: "companyId",
    lead: "leadId",
    opportunity: "opportunityId",
    person: "personId",
    project: "projectId",
    task: "taskId",
  };
  return map[resource] ?? "";
}

export const copperToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();
  const operation = String(node.parameters.operation ?? "create");
  const isGetAll = operation === "getAll";

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
  const resource = String(node.parameters.resource ?? "lead");
  const operation = String(node.parameters.operation ?? "create");
  const headers = await getAuthHeaders(ctx);
  const endpoint = entityEndpoint(resource);

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

  if (operation === "getAll") {
    if (resource === "customerSource") {
      const res = await sdkHttpRequest({
        method: "GET",
        url: `${API_BASE}/customer_sources`,
        headers,
      });
      return res.body as Record<string, unknown>[];
    }
    if (resource === "user") {
      const filterFields = (node.parameters.filterFields ?? {}) as Record<string, unknown>;
      const resolvedFilters: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(filterFields)) {
        resolvedFilters[k] = resolveExpressions(v, itemJson);
      }
      const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
      const limit = Number(node.parameters.limit ?? 50);
      const body: Record<string, unknown> = { page_size: 200, page_number: 1 };
      if (resolvedFilters.sort_by) {
        body.sort_by = resolvedFilters.sort_by;
        body.sort_direction = resolvedFilters.sort_direction ?? "asc";
      }
      const res = await sdkHttpRequest({
        method: "POST",
        url: `${API_BASE}/users/search`,
        headers,
        body,
      });
      const data = Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
      return returnAll ? data : data.slice(0, limit);
    }

    const filterFields = (node.parameters.filterFields ?? {}) as Record<string, unknown>;
    const resolvedFilters: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filterFields)) {
      resolvedFilters[k] = resolveExpressions(v, itemJson);
    }
    const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
    const limit = Number(node.parameters.limit ?? 50);
    const body: Record<string, unknown> = { page_size: 200, page_number: 1 };
    if (resolvedFilters.sort_by) {
      body.sort_by = resolvedFilters.sort_by;
      body.sort_direction = resolvedFilters.sort_direction ?? "asc";
    }
    if (resolvedFilters.name) body.name = resolvedFilters.name;
    if (resolvedFilters.country) body.country = resolvedFilters.country;
    if (resolvedFilters.company_ids) body.company_ids = String(resolvedFilters.company_ids).split(",").map((s: string) => s.trim()).filter(Boolean);
    if (resolvedFilters.customer_source_ids) body.customer_source_ids = String(resolvedFilters.customer_source_ids).split(",").map((s: string) => s.trim()).filter(Boolean);
    if (resolvedFilters.assignee_ids) body.assignee_ids = String(resolvedFilters.assignee_ids).split(",").map((s: string) => s.trim()).filter(Boolean);
    if (resolvedFilters.project_ids) body.project_ids = String(resolvedFilters.project_ids).split(",").map((s: string) => s.trim()).filter(Boolean);

    const res = await sdkHttpRequest({
      method: "POST",
      url: `${API_BASE}/${endpoint}/search`,
      headers,
      body,
    });
    const data = Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
    return returnAll ? data : data.slice(0, limit);
  }

  if (operation === "get") {
    const idParam = entityIdParam(resource);
    const rawId = String(resolveExpressions(node.parameters[idParam], itemJson) ?? "");
    if (!rawId) throw new Error(`Copper: ${idParam} is required for Get operation`);
    const res = await apiCall({ method: "GET", url: `${API_BASE}/${endpoint}/${rawId}` });
    return res as Record<string, unknown>;
  }

  if (operation === "create") {
    const rawName = String(resolveExpressions(node.parameters.name, itemJson) ?? "");
    const rawFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const fields = resolveFields(rawFields, itemJson);
    if (rawName) fields.name = rawName;
    const res = await apiCall({ method: "POST", url: `${API_BASE}/${endpoint}`, body: fields });
    return res as Record<string, unknown>;
  }

  if (operation === "update") {
    const idParam = entityIdParam(resource);
    const rawId = String(resolveExpressions(node.parameters[idParam], itemJson) ?? "");
    if (!rawId) throw new Error(`Copper: ${idParam} is required for Update operation`);
    const rawFields = node.parameters.updateFields as Record<string, unknown> | undefined;
    const fields = resolveFields(rawFields, itemJson);
    const res = await apiCall({ method: "PUT", url: `${API_BASE}/${endpoint}/${rawId}`, body: fields });
    return res as Record<string, unknown>;
  }

  if (operation === "delete") {
    const idParam = entityIdParam(resource);
    const rawId = String(resolveExpressions(node.parameters[idParam], itemJson) ?? "");
    if (!rawId) throw new Error(`Copper: ${idParam} is required for Delete operation`);
    const res = await apiCall({ method: "DELETE", url: `${API_BASE}/${endpoint}/${rawId}` });
    return res as Record<string, unknown>;
  }

  throw new Error(`Copper: unsupported resource/operation "${resource}/${operation}"`);
}
