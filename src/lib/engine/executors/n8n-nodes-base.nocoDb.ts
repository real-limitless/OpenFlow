import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
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
  const apiKey = String(credentials.apiKey ?? "");
  const baseUrl = String(credentials.baseUrl ?? "http://localhost:8080");
  const url = baseUrl.replace(/\/+$/, "");

  return {
    async request(method: string, path: string, body?: unknown) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["xc-token"] = apiKey;
        }
        const init: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };
        if (body !== undefined) {
          init.body = JSON.stringify(body);
        }
        const resp = await fetch(`${url}/api/v1${path}`, init);
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

function parseOperation(input: Record<string, unknown>): {
  operation: string;
  table: string;
  payload?: Record<string, unknown>;
  where?: Record<string, unknown>;
} {
  const operation = String(input.operation ?? "select");
  const table = String(input.table ?? "");
  const payload = input.payload ? (input.payload as Record<string, unknown>) : undefined;
  const where = input.where ? (input.where as Record<string, unknown>) : undefined;
  return { operation, table, payload, where };
}

function buildUrl(table: string): string {
  return `/db/data/bulk/${encodeURIComponent(table)}`;
}

function buildQueryUrl(table: string): string {
  return `/db/data/bulk/${encodeURIComponent(table)}/list`;
}

async function executeOperation(
  client: NocoDbClient,
  operation: string,
  table: string,
  payload?: Record<string, unknown>,
  where?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (operation) {
    case "select": {
      const qs = where ? `?where=${encodeURIComponent(JSON.stringify(where))}` : "";
      const { status, body } = await client.request("GET", buildQueryUrl(table) + qs);
      if (status >= 400) {
        const errBody = asObj(body);
        return { error: `Invalid table: ${table}`, details: errBody };
      }
      return { records: body };
    }
    case "insert": {
      const { status, body } = await client.request("POST", buildUrl(table), payload);
      if (status >= 400) {
        const errBody = asObj(body);
        return { error: String(errBody.message ?? "Insert failed"), details: errBody };
      }
      const result = asObj(body);
      return { created: true, id: result.id ?? result.Id ?? null, record: result };
    }
    case "update": {
      const { status, body } = await client.request("PATCH", buildUrl(table), payload);
      if (status >= 400) {
        const errBody = asObj(body);
        return { error: String(errBody.message ?? "Update failed"), details: errBody };
      }
      return { updated: true, result: body };
    }
    case "delete": {
      const { status, body } = await client.request("DELETE", buildUrl(table), { ...where });
      if (status >= 400) {
        const errBody = asObj(body);
        return { error: String(errBody.message ?? "Delete failed"), details: errBody };
      }
      return { deleted: true, result: body };
    }
    default:
      return { error: `Unsupported operation: ${operation}` };
  }
}

export const nocoDbExecutor: NodeExecutor = async (
  ctx: ExecutionContext,
  node: { parameters: Record<string, unknown> },
): Promise<INodeExecutionData[][]> => {
  const items = ensureItems(ctx.getInputItems(0));
  const credentials = await ctx.getCredential("nocoDbApi");

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials ?? {});

  const batchSize = Number(node.parameters.batchSize ?? 1);
  const results: INodeExecutionData[] = [];

  try {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      for (const item of batch) {
        const input = item.json as Record<string, unknown>;
        const op = parseOperation(input);
        const result = await executeOperation(client, op.operation, op.table, op.payload, op.where);
        results.push({ json: result });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ json: { error: message } });
  }

  return [results];
};
