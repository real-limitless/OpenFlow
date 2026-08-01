import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

export interface NocoDbClient {
  request(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
}

export type NocoDbClientFactory = (credentials: Record<string, unknown>) => Promise<NocoDbClient>;

let clientFactory: NocoDbClientFactory | null = null;

export function setNocoDbClientFactory(factory: NocoDbClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: NocoDbClientFactory = async (credentials) => {
  const authHeader: string = credentials.xcToken
    ? "xc-token"
    : credentials.xcAuth
      ? "xc-auth"
      : "xc-token";
  const token = String(credentials[authHeader === "xc-token" ? "xcToken" : "xcAuth"] ?? "");
  const baseUrl = String(credentials.baseUrl ?? "http://localhost:8080").replace(/\/+$/, "");

  return {
    async request(method: string, path: string, body?: unknown) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers[authHeader] = token;
        const init: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) init.body = JSON.stringify(body);
        const resp = await fetch(`${baseUrl}${path}`, init);
        const text = await resp.text();
        let respBody: unknown;
        try { respBody = text ? JSON.parse(text) : {}; } catch { respBody = text; }
        return { status: resp.status, body: respBody };
      } finally {
        clearTimeout(timer);
      }
    },
  };
};

function buildTablePath(projectId: string, table: string): string {
  return `/api/v1/db/data/bulk/${encodeURIComponent(projectId)}/${encodeURIComponent(table)}`;
}

function buildRowPath(projectId: string, table: string, rowId: string): string {
  return `/api/v1/db/data/bulk/${encodeURIComponent(projectId)}/${encodeURIComponent(table)}/${encodeURIComponent(rowId)}`;
}

function buildQueryPath(projectId: string, table: string): string {
  return `/api/v1/db/data/bulk/${encodeURIComponent(projectId)}/${encodeURIComponent(table)}/list`;
}

function buildNocoDbUrl(projectId: string, table: string, rowId?: string): string {
  const base = `/api/v1/db/data/bulk/${encodeURIComponent(projectId)}/${encodeURIComponent(table)}`;
  return rowId ? `${base}/${encodeURIComponent(rowId)}` : base;
}

export const nocoDbExecutor: NodeExecutor = async (
  ctx: ExecutionContext,
  _node: { parameters: Record<string, unknown> },
): Promise<INodeExecutionData[][]> => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "create");
  const projectId = ctx.getParam<string>("projectId", "");
  const table = ctx.getParam<string>("table", "");
  const returnAll = ctx.getParam<boolean>("returnAll", false);
  const limit = ctx.getParam<number>("limit", 50);
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const continueOnFail = ctx.continueOnFail();
  const credentials = await ctx.getCredential("nocoDbApi");

  if (!projectId || !table) {
    throw new Error("Project ID and table are required");
  }

  const results: INodeExecutionData[] = [];

  try {
    const factory = clientFactory ?? DEFAULT_FACTORY;
    const client = await factory(credentials ?? {});
    for (const item of items) {
      const itemJson = item.json as Record<string, unknown>;

      if (operation === "create") {
        const dataToSend = ctx.getParam<string>("dataToSend", "defineBelow");
        let body: Record<string, unknown> = {};

        if (dataToSend === "autoMapInputData") {
          const inputsToIgnore = ctx.getParam<string>("inputsToIgnore", "");
          const ignoreSet = new Set(inputsToIgnore.split(",").map((s) => s.trim()).filter(Boolean));
          for (const [key, value] of Object.entries(itemJson)) {
            if (!ignoreSet.has(key)) {
              body[key] = value;
            }
          }
        } else {
          const fieldsUi = ctx.getParam<Record<string, unknown>>("fieldsUi", {});
          const fieldValues = (fieldsUi as { fieldValues?: Array<Record<string, unknown>> }).fieldValues ?? [];
          for (const fv of fieldValues) {
            body[fv.fieldName as string] = fv.fieldValue;
          }
        }

        const { status, body: respBody } = await client.request("POST", buildTablePath(projectId, table), body);
        if (status >= 400) { throw new Error(`Create failed: ${JSON.stringify(respBody)}`); }
        results.push({ json: asObj(respBody) });
      } else if (operation === "get") {
        const rowId = ctx.getParam<string>("id", "");
        if (!rowId) throw new Error("Row ID is required for get operation");
        const { status, body: respBody } = await client.request("GET", buildRowPath(projectId, table, rowId));
        if (status >= 400) { throw new Error(`Get failed: ${JSON.stringify(respBody)}`); }
        results.push({ json: asObj(respBody) });
      } else if (operation === "getAll") {
        const sort = (options as Record<string, unknown>).sort as { property?: Array<{ field: string; direction: string }> } | undefined;
        const fields = (options as Record<string, unknown>).fields as string[] | undefined;
        const viewId = ctx.getParam<string>("options.viewId", undefined) ?? (options as Record<string, unknown>).viewId as string | undefined;
        const filterByFormula = ctx.getParam<string>("options.filterByFormula", undefined) ?? (options as Record<string, unknown>).filterByFormula as string | undefined;

        const qp = new URLSearchParams();
        if (!returnAll) qp.set("limit", String(limit));
        if (fields && fields.length > 0) qp.set("fields", fields.join(","));
        if (viewId) qp.set("viewId", viewId);
        if (filterByFormula) qp.set("filterByFormula", filterByFormula);
        if (sort?.property?.length) {
          for (const s of sort.property) {
            qp.append("sort", `${s.field},${s.direction}`);
          }
        }

        const qs = qp.toString();
        const { status, body: respBody } = await client.request("GET", buildQueryPath(projectId, table) + (qs ? `?${qs}` : ""));
        if (status >= 400) { throw new Error(`GetAll failed: ${JSON.stringify(respBody)}`); }
        const rows = Array.isArray(respBody) ? respBody : (asObj(respBody).list ?? []);
        results.push({ json: { list: rows } });
      } else if (operation === "update") {
        const primaryKey = ctx.getParam<string>("primaryKey", "id");
        const rowId = ctx.getParam<string>("id", "");
        if (!rowId) throw new Error("Row ID is required for update operation");
        const dataToSend = ctx.getParam<string>("dataToSend", "defineBelow");
        let body: Record<string, unknown> = {};

        if (dataToSend === "autoMapInputData") {
          const inputsToIgnore = ctx.getParam<string>("inputsToIgnore", "");
          const ignoreSet = new Set(inputsToIgnore.split(",").map((s) => s.trim()).filter(Boolean));
          for (const [key, value] of Object.entries(itemJson)) {
            if (!ignoreSet.has(key)) {
              body[key] = value;
            }
          }
        } else {
          const fieldsUi = ctx.getParam<Record<string, unknown>>("fieldsUi", {});
          const fieldValues = (fieldsUi as { fieldValues?: Array<Record<string, unknown>> }).fieldValues ?? [];
          for (const fv of fieldValues) {
            body[fv.fieldName as string] = fv.fieldValue;
          }
        }

        const { status, body: respBody } = await client.request("PATCH", buildRowPath(projectId, table, rowId), body);
        if (status >= 400) { throw new Error(`Update failed: ${JSON.stringify(respBody)}`); }
        results.push({ json: asObj(respBody) });
      } else if (operation === "delete") {
        const primaryKey = ctx.getParam<string>("primaryKey", "id");
        const rowId = ctx.getParam<string>("id", "");
        if (!rowId) throw new Error("Row ID is required for delete operation");
        const { status, body: respBody } = await client.request("DELETE", buildRowPath(projectId, table, rowId));
        if (status >= 400) { throw new Error(`Delete failed: ${JSON.stringify(respBody)}`); }
        results.push({ json: { success: true } });
      }
    }
  } catch (err) {
    if (continueOnFail) {
      results.push({ json: { error: err instanceof Error ? err.message : String(err) } });
    } else {
      throw err;
    }
  }

  return [results];
};
