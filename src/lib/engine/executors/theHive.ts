import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const RESOURCE_API: Record<string, string> = {
  alert: "alert",
  case: "case",
  observable: "observable",
  task: "task",
  log: "log",
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const expr = raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1");
      const fn = new Function("$json", `return (${expr})`);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function pick<T>(obj: Record<string, unknown>, key: string, fallback?: T): T {
  const v = obj[key] as T;
  return v !== undefined ? v : (fallback as T);
}

async function getBaseUrl(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("theHiveApi");
  if (!cred) throw new Error("TheHive: credential 'theHiveApi' is not configured");
  const data = cred as Record<string, unknown>;
  const url = String(data.url ?? "").replace(/\/+$/, "");
  if (!url) throw new Error("TheHive: credential 'url' is missing");
  return url;
}

async function getApiVersion(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("theHiveApi");
  if (!cred) return "";
  const data = cred as Record<string, unknown>;
  return String(data.apiVersion ?? "");
}

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("theHiveApi");
  if (!cred) throw new Error("TheHive: credential 'theHiveApi' is not configured");
  const data = cred as Record<string, unknown>;
  return String(data.apiKey ?? "");
}

function operationMethod(operation: string): string {
  switch (operation) {
    case "Create":
    case "Promote to Case":
    case "Merge Into Case":
    case "Execute Responder":
    case "Execute Analyzer":
      return "POST";
    case "Get":
    case "Search":
    case "Get Timeline":
    case "Get Attachment":
    case "Count":
      return "GET";
    case "Update":
    case "Update Status":
      return "PATCH";
    case "Delete":
    case "Delete Attachment":
      return "DELETE";
    case "Add Attachment":
      return "POST";
    default:
      return "GET";
  }
}

function buildUrl(
  baseUrl: string,
  resource: string,
  operation: string,
  id: string | undefined,
  caseId: string | undefined,
  taskId: string | undefined,
  apiVersion: string,
): string {
  const collection = RESOURCE_API[resource] ?? resource;
  const prefix = apiVersion === "theHive4" ? "/api/v1" : "/api";

  if (operation === "Promote to Case") {
    return `${baseUrl}${prefix}/alert/${id}/case`;
  }
  if (operation === "Merge Into Case") {
    return `${baseUrl}${prefix}/alert/${id}/merge`;
  }
  if (operation === "Execute Responder") {
    return `${baseUrl}${prefix}/${collection}/${id}/responder`;
  }
  if (operation === "Execute Analyzer") {
    return `${baseUrl}${prefix}/${collection}/${id}/analyzer`;
  }
  if (operation === "Get Timeline") {
    return `${baseUrl}${prefix}/case/${caseId ?? id}/timeline`;
  }
  if (operation === "Add Attachment" || operation === "Get Attachment" || operation === "Delete Attachment") {
    if (resource === "log") {
      return `${baseUrl}${prefix}/case/${caseId}/task/${taskId}/log/${id ? id + "/attachments" : "attachments"}`;
    }
    return `${baseUrl}${prefix}/case/${caseId}/attachments`;
  }

  switch (operation) {
    case "Create":
      return `${baseUrl}${prefix}/${collection}`;
    case "Search":
    case "Count":
      return `${baseUrl}${prefix}/${collection}/_search`;
    case "Get":
    case "Update":
    case "Delete":
      return id ? `${baseUrl}${prefix}/${collection}/${id}` : `${baseUrl}${prefix}/${collection}`;
    default:
      return `${baseUrl}${prefix}/${collection}`;
  }
}

function resultKey(resource: string, operation: string): string {
  if (operation === "Promote to Case" || operation === "Merge Into Case") return "case";
  return resource;
}

export const theHiveExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "alert").toLowerCase();
  const operation = String(node.parameters.operation ?? "Create");
  const continueOnFail = ctx.continueOnFail();
  const baseUrl = await getBaseUrl(ctx);
  const apiKey = await getApiKey(ctx);
  const apiVersion = await getApiVersion(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      const rawId = node.parameters.id !== undefined ? resolveValue(node.parameters.id, itemJson) : undefined;
      const id = rawId ? String(rawId) : undefined;
      const rawBody = node.parameters.body !== undefined
        ? parseJson(resolveValue(node.parameters.body, itemJson) as string | Record<string, unknown>)
        : undefined;
      const rawCaseId = node.parameters.caseId !== undefined ? String(resolveValue(node.parameters.caseId, itemJson) ?? "") : undefined;
      const rawTaskId = node.parameters.taskId !== undefined ? String(resolveValue(node.parameters.taskId, itemJson) ?? "") : undefined;
      const searchFilters = node.parameters.searchFilters !== undefined
        ? parseJson(resolveValue(node.parameters.searchFilters, itemJson) as string | Record<string, unknown>)
        : undefined;

      const url = buildUrl(baseUrl, resource, operation, id, rawCaseId, rawTaskId, apiVersion);
      const method = operationMethod(operation);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      let body: string | undefined;
      if (method === "POST" || method === "PATCH" || method === "PUT") {
        if (rawBody) {
          body = JSON.stringify(rawBody);
        } else if (searchFilters && (operation === "Search" || operation === "Count")) {
          body = JSON.stringify(searchFilters);
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const init: RequestInit = { method, headers, body, signal: controller.signal };
        const response = await fetch(url, init);
        const text = await response.text();
        let parsed: unknown = text;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

        if (response.status < 200 || response.status >= 300) {
          const errMsg = typeof parsed === "object" && parsed !== null
            ? String((parsed as Record<string, unknown>).message ?? "") || `TheHive API error: ${response.status}`
            : `TheHive API error: ${response.status}`;
          const err = new Error(errMsg);
          (err as Record<string, unknown>).status = response.status;
          throw err;
        }

        const key = resultKey(resource, operation);

        if (operation === "Search" && Array.isArray(parsed)) {
          for (const result of parsed) {
            out.push({ json: { [key]: result }, pairedItem });
          }
        } else if (operation === "Count" && parsed && typeof parsed === "object") {
          out.push({ json: { count: (parsed as Record<string, unknown>).count ?? 0 }, pairedItem });
        } else if (operation === "Get Timeline" && Array.isArray(parsed)) {
          for (const result of parsed) {
            out.push({ json: { timeline: result }, pairedItem });
          }
        } else if (Array.isArray(parsed)) {
          for (const result of parsed) {
            out.push({ json: { [resource]: result }, pairedItem });
          }
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          if (obj._id || obj.id) {
            out.push({ json: { [key]: obj }, pairedItem });
          } else if (Object.keys(obj).length > 0) {
            out.push({ json: { [key]: obj }, pairedItem });
          } else {
            out.push({ json: { [key]: id ? { id } : {} }, pairedItem });
          }
        } else {
          out.push({ json: { [key]: id ? { id } : {} }, pairedItem });
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};
