import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

export interface BaserowClient {
  request(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
}

export type BaserowClientFactory = (credentials: Record<string, unknown>) => Promise<BaserowClient>;

let clientFactory: BaserowClientFactory | null = null;

export function setBaserowClientFactory(factory: BaserowClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: BaserowClientFactory = async (credentials) => {
  const token = String(credentials.token ?? "");
  const username = String(credentials.username ?? "");
  const password = String(credentials.password ?? "");
  const baseUrl = String(credentials.baseUrl ?? "https://api.baserow.io");
  const url = baseUrl.replace(/\/+$/, "");

  return {
    async request(method: string, path: string, body?: unknown) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Token ${token}`;
        } else if (username && password) {
          headers["Authorization"] = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
        }
        const init: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) {
          init.body = JSON.stringify(body);
        }
        const resp = await fetch(`${url}/api${path}`, init);
        let respBody: unknown;
        const text = await resp.text();
        try {
          respBody = text ? JSON.parse(text) : {};
        } catch {
          respBody = text;
        }
        return { status: resp.status, body: respBody };
      } finally {
        clearTimeout(timer);
      }
    },
  };
};

function parseInput(input: Record<string, unknown>): {
  operation: string;
  table: string;
  rowId?: number;
  payload?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  qs?: Record<string, unknown>;
} {
  const operation = String(input.operation ?? "create");
  const tableIdOrName = String(input.table ?? "");
  const rowId = input.rowId !== undefined ? Number(input.rowId) : undefined;
  const payload = input.payload ? (input.payload as Record<string, unknown>) : undefined;
  const filters = input.filters ? (input.filters as Record<string, unknown>) : undefined;
  const qs = input.qs ? (input.qs as Record<string, unknown>) : undefined;
  return { operation, table: tableIdOrName, rowId, payload, filters, qs };
}

function buildQs(query: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? "?" + parts.join("&") : "";
}

async function executeOperation(
  client: BaserowClient,
  operation: string,
  table: string,
  rowId?: number,
  payload?: Record<string, unknown>,
  filters?: Record<string, unknown>,
  qs?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tablePath = `/database/rows/table/${encodeURIComponent(table)}/`;

  switch (operation) {
    case "create": {
      const { status, body } = await client.request("POST", tablePath, payload);
      if (status >= 400) {
        return { error: `Create failed: ${status}`, details: body };
      }
      const result = body as Record<string, unknown>;
      return { id: result.id, ...result };
    }
    case "read": {
      if (rowId !== undefined) {
        const { status, body } = await client.request("GET", `${tablePath}${rowId}/`);
        if (status >= 400) {
          return { error: `Read failed: ${status}`, details: body };
        }
        return body as Record<string, unknown>;
      }
      const filterQs = filters ? buildQs(filters) : "";
      const extraQs = qs ? buildQs(qs) : "";
      const { status, body } = await client.request("GET", tablePath + filterQs + (extraQs ? (filterQs ? "&" : "?") + extraQs.slice(1) : ""));
      if (status >= 400) {
        return { error: `Read failed: ${status}`, details: body };
      }
      const result = body as { results?: unknown[] };
      return { records: result.results ?? [] };
    }
    case "update": {
      if (rowId === undefined) {
        return { error: "rowId required for update" };
      }
      const { status, body } = await client.request("PATCH", `${tablePath}${rowId}/`, payload);
      if (status >= 400) {
        return { error: `Update failed: ${status}`, details: body };
      }
      return body as Record<string, unknown>;
    }
    case "delete": {
      if (rowId === undefined) {
        return { error: "rowId required for delete" };
      }
      const { status } = await client.request("DELETE", `${tablePath}${rowId}/`);
      if (status >= 400) {
        return { error: `Delete failed: ${status}` };
      }
      return { success: true };
    }
    case "createMultiple": {
      const { status, body } = await client.request("POST", `${tablePath}batch/`, payload);
      if (status >= 400) {
        return { error: `Batch create failed: ${status}`, details: body };
      }
      return body as Record<string, unknown>;
    }
    case "updateMultiple": {
      const { status, body } = await client.request("PATCH", `${tablePath}batch/`, payload);
      if (status >= 400) {
        return { error: `Batch update failed: ${status}`, details: body };
      }
      return body as Record<string, unknown>;
    }
    case "deleteMultiple": {
      const { status, body } = await client.request("DELETE", `${tablePath}batch/`, payload);
      if (status >= 400) {
        return { error: `Batch delete failed: ${status}`, details: body };
      }
      return { success: true };
    }
    default:
      return { error: `Unsupported operation: ${operation}` };
  }
}

export const baserowExecutor: NodeExecutor = async (
  ctx: ExecutionContext,
  node: { parameters: Record<string, unknown> },
): Promise<INodeExecutionData[][]> => {
  const items = ensureItems(ctx.getInputItems(0));
  const credentials = await ctx.getCredential("baserowApi");

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials ?? {});

  const results: INodeExecutionData[] = [];

  try {
    for (const item of items) {
      const input = item.json as Record<string, unknown>;
      const op = parseInput(input);
      const result = await executeOperation(
        client,
        op.operation,
        op.table,
        op.rowId,
        op.payload,
        op.filters,
        op.qs,
      );
      results.push({ json: result });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ json: { error: message } });
  }

  return [results];
};
