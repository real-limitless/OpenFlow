import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const RESOURCE_API: Record<string, string> = {
  alert: "alert",
  case: "case",
  comment: "comment",
  observable: "observable",
  page: "page",
  query: "query",
  task: "task",
  taskLog: "task_log",
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

async function getBaseUrl(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("theHiveProjectApi");
  if (!cred) throw new Error("TheHiveProject: credential 'theHiveProjectApi' is not configured");
  const data = cred as Record<string, unknown>;
  const url = String(data.url ?? "").replace(/\/+$/, "");
  if (!url) throw new Error("TheHiveProject: credential 'url' is missing");
  return url;
}

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("theHiveProjectApi");
  if (!cred) throw new Error("TheHiveProject: credential 'theHiveProjectApi' is not configured");
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
    case "Execute Query":
    case "Add Attachment":
    case "Search":
      return "POST";
    case "Get":
    case "Get Timeline":
    case "Get Attachment":
      return "GET";
    case "Update":
    case "Update Status":
      return "PATCH";
    case "Delete":
    case "Delete Attachment":
      return "DELETE";
    default:
      return "GET";
  }
}

function buildUrl(
  baseUrl: string,
  resource: string,
  operation: string,
  id: string | undefined,
): string {
  const collection = RESOURCE_API[resource] ?? resource;
  const prefix = "/api/v1";

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
    return `${baseUrl}${prefix}/case/${id}/timeline`;
  }
  if (operation === "Add Attachment" || operation === "Get Attachment" || operation === "Delete Attachment") {
    if (resource === "taskLog") {
      return `${baseUrl}${prefix}/case/${id}/task_log/${id ? id + "/attachments" : "attachments"}`;
    }
    return `${baseUrl}${prefix}/case/${id}/attachments`;
  }
  if (operation === "Execute Query") {
    return `${baseUrl}${prefix}/query`;
  }

  switch (operation) {
    case "Create":
      return `${baseUrl}${prefix}/${collection}`;
    case "Search":
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

export const theHiveProjectExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "alert").toLowerCase();
  const operation = String(node.parameters.operation ?? "Create");
  const continueOnFail = ctx.continueOnFail();
  const baseUrl = await getBaseUrl(ctx);
  const apiKey = await getApiKey(ctx);

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
      const searchFilters = node.parameters.searchFilters !== undefined
        ? parseJson(resolveValue(node.parameters.searchFilters, itemJson) as string | Record<string, unknown>)
        : undefined;
      const rawQuery = node.parameters.query !== undefined
        ? parseJson(resolveValue(node.parameters.query, itemJson) as string | Record<string, unknown>)
        : undefined;
      const options = (node.parameters.options ?? {}) as Record<string, unknown>;

      const url = buildUrl(baseUrl, resource, operation, id);
      const method = operationMethod(operation);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      };

      let body: BodyInit | undefined;
      const isAttachment = operation === "Add Attachment";
      if (isAttachment) {
        const binaryData = item.binary?.["attachment"] ?? item.binary?.["data"];
        if (binaryData) {
          const formData = new FormData();
          const byteString = atob(binaryData.data);
          const bytes = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
          const blob = new Blob([bytes], { type: binaryData.mimeType ?? "application/octet-stream" });
          formData.append("attachment", blob, binaryData.fileName ?? "attachment");
          formData.append("_json", JSON.stringify(rawBody ?? {}));
          body = formData;
        } else if (rawBody) {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(rawBody);
        }
      } else {
        headers["Content-Type"] = "application/json";
        if (method === "POST" || method === "PATCH" || method === "PUT") {
          if (operation === "Execute Query" && rawQuery) {
            body = JSON.stringify(rawQuery);
          } else if (operation === "Search") {
            const filters = searchFilters ?? {};
            if (typeof options.limit === "number") (filters as Record<string, unknown>)["limit"] = options.limit;
            if (typeof options.offset === "number") (filters as Record<string, unknown>)["offset"] = options.offset;
            if (options.sortBy) {
              const order = options.sortOrder === "desc" ? "-" : "";
              (filters as Record<string, unknown>)["sort"] = String(order) + String(options.sortBy);
            }
            body = JSON.stringify(filters);
          } else if (rawBody) {
            body = JSON.stringify(rawBody);
          }
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const init: RequestInit = { method, headers, body, signal: controller.signal };
        const response = await fetch(url, init);
        const text = await response.text();
        let parsed: unknown = text;
        try { parsed = text ? JSON.parse(text) : null; } catch { }

        if (response.status < 200 || response.status >= 300) {
          const errMsg = typeof parsed === "object" && parsed !== null
            ? String((parsed as Record<string, unknown>).message ?? "") || `TheHiveProject API error: ${response.status}`
            : `TheHiveProject API error: ${response.status}`;
          const err = new Error(errMsg);
          (err as unknown as Record<string, unknown>).status = response.status;
          throw err;
        }

        const key = resultKey(resource, operation);

        if (operation === "Search" && Array.isArray(parsed)) {
          for (const result of parsed) {
            out.push({ json: { [key]: result }, pairedItem });
          }
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
      if (!continueOnFail) {
        const isNetworkError = err instanceof TypeError || (err instanceof Error && (
          err.message.includes("fetch") || err.message.includes("abort") || err.message.includes("DNS") || err.message.includes("ENOTFOUND")
        ));
        if (isNetworkError) throw err;
        throw err;
      }
      const isNetworkError = err instanceof TypeError || (err instanceof Error && (
        err.message.includes("fetch") || err.message.includes("abort") || err.message.includes("DNS") || err.message.includes("ENOTFOUND")
      ));
      if (isNetworkError) throw err;
    }
  }

  return [out];
};
