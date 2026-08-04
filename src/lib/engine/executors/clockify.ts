import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { withPairedItem } from "@/sdk";

const API_BASE = "https://api.clockify.me/api/v1";

type Resource = "client" | "project" | "tag" | "task" | "timeEntry" | "user" | "workspace";
type Operation = "create" | "delete" | "get" | "getAll" | "update";

interface OpConfig {
  method: string;
  path: (params: Record<string, unknown>) => string;
  body?: (params: Record<string, unknown>) => Record<string, unknown> | undefined;
}

const RESOURCE_OP_MAP: Record<Resource, Record<Operation, OpConfig>> = {
  client: {
    create: {
      method: "POST",
      path: (p) => `/workspaces/${p.workspaceId}/clients`,
      body: (p) => ({ name: p.name }),
    },
    delete: {
      method: "DELETE",
      path: (p) => `/workspaces/${p.workspaceId}/clients/${p.clientId}`,
    },
    get: {
      method: "GET",
      path: (p) => `/workspaces/${p.workspaceId}/clients/${p.clientId}`,
    },
    getAll: {
      method: "GET",
      path: (p) => {
        let base = `/workspaces/${p.workspaceId}/clients`;
        const filters = paramsToQuery(p.additionalFields as Record<string, unknown> | undefined);
        if (filters) base += filters;
        return base;
      },
    },
    update: {
      method: "PUT",
      path: (p) => `/workspaces/${p.workspaceId}/clients/${p.clientId}`,
      body: (p) => updateBody(p.updateFields as Record<string, unknown> | undefined),
    },
  },
  project: {
    create: {
      method: "POST",
      path: (p) => `/workspaces/${p.workspaceId}/projects`,
      body: (p) => ({
        name: p.name,
        ...(p.additionalFields as Record<string, unknown>),
      }),
    },
    delete: {
      method: "DELETE",
      path: (p) => `/workspaces/${p.workspaceId}/projects/${p.projectId}`,
    },
    get: {
      method: "GET",
      path: (p) => `/workspaces/${p.workspaceId}/projects/${p.projectId}`,
    },
    getAll: {
      method: "GET",
      path: (p) => {
        let base = `/workspaces/${p.workspaceId}/projects`;
        const qs = buildPaginationQs(p);
        const filters = paramsToQuery(p.additionalFields as Record<string, unknown> | undefined);
        base += qs || filters ? "?" : "";
        if (qs) base += qs;
        if (filters) base += (qs ? "&" : "") + filters.slice(1);
        return base;
      },
    },
    update: {
      method: "PUT",
      path: (p) => `/workspaces/${p.workspaceId}/projects/${p.projectId}`,
      body: (p) => updateBody(p.updateFields as Record<string, unknown> | undefined),
    },
  },
  tag: {
    create: {
      method: "POST",
      path: (p) => `/workspaces/${p.workspaceId}/tags`,
      body: (p) => ({ name: p.name }),
    },
    delete: {
      method: "DELETE",
      path: (p) => `/workspaces/${p.workspaceId}/tags/${p.tagId}`,
    },
    getAll: {
      method: "GET",
      path: (p) => {
        let base = `/workspaces/${p.workspaceId}/tags`;
        const filters = paramsToQuery(p.additionalFields as Record<string, unknown> | undefined);
        if (filters) base += filters;
        return base;
      },
    },
    update: {
      method: "PUT",
      path: (p) => `/workspaces/${p.workspaceId}/tags/${p.tagId}`,
      body: (p) => updateBody(p.updateFields as Record<string, unknown> | undefined),
    },
  },
  task: {
    create: {
      method: "POST",
      path: (p) => `/workspaces/${p.workspaceId}/projects/${p.projectId}/tasks`,
      body: (p) => ({
        name: p.name,
        ...(p.additionalFields as Record<string, unknown>),
      }),
    },
    delete: {
      method: "DELETE",
      path: (p) => `/workspaces/${p.workspaceId}/projects/${p.projectId}/tasks/${p.taskId}`,
    },
    get: {
      method: "GET",
      path: (p) => `/workspaces/${p.workspaceId}/projects/${p.projectId}/tasks/${p.taskId}`,
    },
    getAll: {
      method: "GET",
      path: (p) => {
        let base = `/workspaces/${p.workspaceId}/projects/${p.projectId}/tasks`;
        const qs = buildPaginationQs(p);
        const filters = paramsToQuery(p.filters as Record<string, unknown> | undefined);
        base += qs || filters ? "?" : "";
        if (qs) base += qs;
        if (filters) base += (qs ? "&" : "") + filters.slice(1);
        return base;
      },
    },
    update: {
      method: "PUT",
      path: (p) => `/workspaces/${p.workspaceId}/projects/${p.projectId}/tasks/${p.taskId}`,
      body: (p) => updateBody(p.updateFields as Record<string, unknown> | undefined),
    },
  },
  timeEntry: {
    create: {
      method: "POST",
      path: (p) => `/workspaces/${p.workspaceId}/time-entries`,
      body: (p) => ({
        start: p.start,
        ...(p.additionalFields as Record<string, unknown>),
      }),
    },
    delete: {
      method: "DELETE",
      path: (p) => `/workspaces/${p.workspaceId}/time-entries/${p.timeEntryId}`,
    },
    get: {
      method: "GET",
      path: (p) => `/workspaces/${p.workspaceId}/time-entries/${p.timeEntryId}`,
    },
    getAll: {
      method: "GET",
      path: (p) => {
        let base = `/workspaces/${p.workspaceId}/time-entries`;
        const qs = buildPaginationQs(p);
        if (qs) base += "?" + qs;
        return base;
      },
    },
    update: {
      method: "PUT",
      path: (p) => `/workspaces/${p.workspaceId}/time-entries/${p.timeEntryId}`,
      body: (p) => updateBody(p.updateFields as Record<string, unknown> | undefined),
    },
  },
  user: {
    getAll: {
      method: "GET",
      path: (p) => {
        let base = `/workspaces/${p.workspaceId}/users`;
        const filters = paramsToQuery(p.additionalFields as Record<string, unknown> | undefined);
        if (filters) base += filters;
        return base;
      },
    },
  },
  workspace: {
    getAll: {
      method: "GET",
      path: () => "/workspaces",
    },
  },
};

function buildPaginationQs(params: Record<string, unknown>): string {
  const returnAll = params.returnAll === true || params.returnAll === "true";
  if (returnAll) return "";
  const limit = params.limit ? Number(params.limit) : 100;
  const qs = new URLSearchParams({ "page-size": String(Math.min(limit, 500)) });
  return qs.toString();
}

function paramsToQuery(fields: Record<string, unknown> | undefined): string {
  if (!fields || typeof fields !== "object") return "";
  const entries = Object.entries(fields).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

function updateBody(fields: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!fields || typeof fields !== "object") return undefined;
  const entries = Object.entries(fields).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

async function buildHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("clockifyApi");
  const apiKey = cred
    ? String(cred.apiKey ?? cred.accessToken ?? cred.token ?? cred.secret ?? "")
    : "";
  if (!apiKey) {
    throw new Error("Clockify: clockifyApi credential is not configured");
  }
  return {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };
}

async function clockifyRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(
      `Clockify request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function toArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") return [body];
  return [body];
}

async function processItem(
  ctx: ExecutionContext,
  params: Record<string, unknown>,
  resource: Resource,
  operation: Operation,
): Promise<INodeExecutionData> {
  const config = RESOURCE_OP_MAP[resource]?.[operation];
  if (!config) {
    throw new Error(`Clockify: unsupported resource/operation: ${resource}/${operation}`);
  }
  const headers = await buildHeaders(ctx);
  const url = `${API_BASE}${config.path(params)}`;
  const reqBody = config.body ? config.body(params) : undefined;
  const resp = await clockifyRequest(config.method, url, headers, reqBody);

  if (resp.status < 200 || resp.status >= 300) {
    const errBody = resp.body && typeof resp.body === "object"
      ? JSON.stringify(resp.body)
      : String(resp.body ?? "");
    throw new Error(`Clockify API error (${resp.status}): ${errBody}`);
  }

  if (operation === "getAll" && !(params.returnAll === true || params.returnAll === "true")) {
    const arr = toArray(resp.body);
    const limit = params.limit ? Number(params.limit) : 100;
    return { json: arr.slice(0, limit) as unknown as Record<string, unknown> };
  }

  return { json: resp.body as Record<string, unknown> };
}

export const clockifyExecutor: NodeExecutor = async (ctx: ExecutionContext, node: INode) => {
  const params = node.parameters;
  const resource = String(params.resource ?? "") as Resource;
  const operation = String(params.operation ?? "") as Operation;
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    const result = await processItem(ctx, params, resource, operation);
    return [[result]];
  }

  const results: INodeExecutionData[] = [];
  for (let i = 0; i < inputItems.length; i++) {
    try {
      const itemJson = inputItems[i].json as Record<string, unknown>;
      const resolvedParams = { ...params };
      for (const key of Object.keys(resolvedParams)) {
        const raw = resolvedParams[key];
        if (typeof raw === "string" && (raw.startsWith("={{") || raw.includes("{{"))) {
          resolvedParams[key] = ctx.evaluate(raw, itemJson);
        }
      }
      const result = await processItem(ctx, resolvedParams, resource, operation);
      results.push(withPairedItem(result, i));
    } catch (err) {
      if (ctx.continueOnFail()) {
        results.push(
          withPairedItem(
            {
              json: {
                error: err instanceof Error ? err.message : String(err),
              },
            },
            i,
          ),
        );
      } else {
        throw err;
      }
    }
  }
  return [results];
};
