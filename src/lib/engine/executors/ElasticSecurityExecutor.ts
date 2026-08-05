import type { NodeExecutor, ExecutionContext } from "@/sdk";
import type { INodeExecutionData, INode } from "@/lib/workflow/types";

interface ElasticCredential {
  baseUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
}

async function getCredentialOrThrow(ctx: ExecutionContext): Promise<ElasticCredential> {
  const cred = await ctx.getCredential?.("elasticSecurityApi") as ElasticCredential | null | undefined;
  if (!cred?.baseUrl) {
    throw new Error('Missing credential "elasticSecurityApi"');
  }
  return cred;
}

function authHeaders(cred: ElasticCredential): Record<string, string> {
  if (cred.apiKey) {
    return { Authorization: `ApiKey ${cred.apiKey}` };
  }
  if (cred.username && cred.password) {
    const encoded = Buffer.from(`${cred.username}:${cred.password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  throw new Error("Elastic Security credential requires either apiKey or username+password");
}

function buildUrl(baseUrl: string, resource: string, operation: string, params: Record<string, unknown>): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  switch (resource) {
    case "case": {
      const caseId = params.caseId as string | undefined;
      if (operation === "getAll") {
        const qs = new URLSearchParams();
        qs.set("page", String(params.page ?? 1));
        qs.set("perPage", String(params.perPage ?? 20));
        const filters = params.filters as Record<string, unknown> | undefined;
        if (filters) {
          if (filters.tags) qs.set("tags", String(filters.tags));
          if (filters.status) qs.set("status", String(filters.status));
          if (filters.severity) qs.set("severity", String(filters.severity));
          if (filters.assignee) qs.set("assignee", String(filters.assignee));
          if (filters.from) qs.set("from", String(filters.from));
          if (filters.to) qs.set("to", String(filters.to));
          if (filters.search) qs.set("search", String(filters.search));
        }
        return `${cleanBase}/api/cases?${qs.toString()}`;
      }
      if (operation === "getSummary") return `${cleanBase}/api/cases/${caseId}/summary`;
      if (caseId) return `${cleanBase}/api/cases/${caseId}`;
      return `${cleanBase}/api/cases`;
    }
    case "caseComment": {
      const caseId = params.caseId as string;
      const commentId = params.commentId as string | undefined;
      const base = `${cleanBase}/api/cases/${caseId}/comments`;
      if (operation === "getAll") return `${base}?_page=${params.page ?? 1}&_perPage=${params.perPage ?? 20}`;
      if (commentId && (operation === "get" || operation === "remove" || operation === "update")) return `${base}/${commentId}`;
      return base;
    }
    case "caseTag": {
      return `${cleanBase}/api/cases/${params.caseId}/tags`;
    }
    case "connector": {
      return `${cleanBase}/api/actions/connector`;
    }
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}

function buildBody(resource: string, operation: string, params: Record<string, unknown>): Record<string, unknown> | undefined {
  if (operation === "get" || operation === "getAll" || operation === "getSummary" || operation === "delete" || operation === "remove") {
    return undefined;
  }
  switch (resource) {
    case "case": {
      if (operation === "create") {
        const body: Record<string, unknown> = {
          title: params.title,
          connector: params.connector ?? { id: "none", name: "none", type: ".none", fields: null },
        };
        if (params.description) body.description = params.description;
        if (params.tags) body.tags = (params.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean);
        if (params.severity) body.severity = params.severity;
        const af = params.additionalFields as Record<string, unknown> | undefined;
        if (af?.owner) body.owner = af.owner;
        if (af?.syncAlerts !== undefined) body.settings = { syncAlerts: af.syncAlerts };
        return body;
      }
      if (operation === "update") {
        const body: Record<string, unknown> = {};
        if (params.title) body.title = params.title;
        if (params.description) body.description = params.description;
        if (params.status) body.status = params.status;
        if (params.severity) body.severity = params.severity;
        if (params.tags) body.tags = (params.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean);
        if (params.connector) body.connector = params.connector;
        const af = params.additionalFields as Record<string, unknown> | undefined;
        if (af?.assignee) body.assignee = af.assignee;
        return body;
      }
      return undefined;
    }
    case "caseComment": {
      if (operation === "create" || operation === "update") {
        return { comment: params.comment };
      }
      return undefined;
    }
    case "caseTag": {
      if (operation === "add") {
        return { tag: params.tag };
      }
      if (operation === "remove") {
        return { tag: params.tag };
      }
      return undefined;
    }
    case "connector": {
      if (operation === "create") {
        return {
          connectorType: params.connectorType,
          fields: params.connectorFields ? JSON.parse(params.connectorFields as string) : {},
        };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

async function doFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: Record<string, unknown> | undefined,
): Promise<unknown> {
  const opts: RequestInit = {
    method,
    headers: { ...headers, "Content-Type": "application/json", "kbn-xsrf": "true" },
  };
  if (body && method !== "GET" && method !== "HEAD") {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Elastic Security API error ${res.status}: ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return { success: true };
  }
  return res.json();
}

function methodForOperation(operation: string): string {
  switch (operation) {
    case "create":
    case "add": return "POST";
    case "update": return "PATCH";
    case "delete":
    case "remove": return "DELETE";
    case "get":
    case "getSummary": return "GET";
    case "getAll": return "GET";
    default: return "GET";
  }
}

export const elasticSecurityExecutor: NodeExecutor = async (ctx: ExecutionContext, node: INode) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "");
  const operation = ctx.getParam<string>("operation", "");

  if (!resource || !operation) {
    throw new Error("Resource and operation parameters are required");
  }

  const cred = await getCredentialOrThrow(ctx);
  const headers = authHeaders(cred);

  const results: INodeExecutionData[] = [];

  for (const item of items) {
    try {
      const evaluatedParams: Record<string, unknown> = {};
      const rawParams = ctx.getParams() as Record<string, unknown>;
      for (const [key, value] of Object.entries(rawParams)) {
        if (typeof value === "string" && value.includes("{{")) {
          evaluatedParams[key] = ctx.evaluate?.(value, item.json) ?? value;
        } else {
          evaluatedParams[key] = value;
        }
      }

      const method = methodForOperation(operation);
      const body = buildBody(resource, operation, evaluatedParams);
      const url = buildUrl(cred.baseUrl, resource, operation, evaluatedParams);

      const response = await doFetch(url, method, headers, body);

      if (operation === "getAll" && resource === "case") {
        const raw = response as Record<string, unknown>;
        const caseList = Array.isArray(raw.cases) ? raw.cases as Record<string, unknown>[] : Array.isArray(response) ? response as Record<string, unknown>[] : [];
        for (const c of caseList) {
          results.push({ json: c });
        }
      } else {
        results.push({ json: response as Record<string, unknown> });
      }
    } catch (err) {
      if (ctx.continueOnFail?.()) {
        results.push({ json: { error: (err as Error).message } });
      } else {
        throw err;
      }
    }
  }

  return [results];
};
