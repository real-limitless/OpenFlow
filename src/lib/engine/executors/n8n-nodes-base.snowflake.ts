import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

interface SnowflakeQueryResult {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
}

interface SnowflakeClient {
  execute(sql: string, params?: unknown[]): Promise<SnowflakeQueryResult>;
  close(): Promise<void>;
}

export type SnowflakeClientFactory = (
  credentials: Record<string, unknown>,
  options: Record<string, unknown>,
) => Promise<SnowflakeClient>;

let clientFactory: SnowflakeClientFactory | null = null;

export function setSnowflakeClientFactory(factory: SnowflakeClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: SnowflakeClientFactory = async (_credentials, _options) => {
  throw new Error(
    "Snowflake client is not configured. Call setSnowflakeClientFactory() with a Snowflake driver wrapper.",
  );
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>, itemIndex = 0): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson, itemIndex });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseQueryParameters(raw: unknown, itemJson: Record<string, unknown>, itemIndex: number): unknown[] {
  const resolved = resolveValue(raw, itemJson, itemIndex);
  if (Array.isArray(resolved)) return resolved;
  if (typeof resolved === "string") {
    const trimmed = resolved.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* comma-separated */
    }
    return trimmed.split(",").map((s) => s.trim());
  }
  if (resolved == null) return [];
  return [resolved];
}

export const snowflakeExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "executeQuery");
  const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {}) ?? {};
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("snowflake");
  if (!credentials) {
    throw new Error('Snowflake: credential "snowflake" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials, additionalFields);

  try {
    switch (operation) {
      case "executeQuery":
        return [await executeQueryOperation(ctx, items, client, additionalFields, continueOnFail)];
      case "insert":
        return [await insertOperation(ctx, items, client, continueOnFail)];
      case "update":
        return [await updateOperation(ctx, items, client, continueOnFail)];
      default:
        throw new Error(`Snowflake: unknown operation "${operation}"`);
    }
  } finally {
    await client.close().catch(() => {});
  }
};

async function executeQueryOperation(
  ctx: Parameters<typeof snowflakeExecutor>[0],
  items: INodeExecutionData[],
  client: SnowflakeClient,
  additionalFields: Record<string, unknown>,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const query = String(resolveValue(ctx.getParam("query", ""), item.json, index) ?? "");
      if (!query) throw new Error("Snowflake: query is required");
      const queryParametersRaw = additionalFields.queryParameters;
      const params = queryParametersRaw
        ? parseQueryParameters(queryParametersRaw, item.json, index)
        : [];
      const result = await client.execute(query, params);
      if (result.rows.length === 0) {
        out.push({
          json: {} as Record<string, unknown>,
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
        continue;
      }
      for (const row of result.rows) {
        out.push({
          json: row,
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      }
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }
  return out;
}

async function insertOperation(
  ctx: Parameters<typeof snowflakeExecutor>[0],
  items: INodeExecutionData[],
  client: SnowflakeClient,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const table = String(ctx.getParam("table", "") ?? "");
      if (!table) throw new Error("Snowflake: table is required");
      const columnsParam = ctx.getParam<string>("columns", "");
      const itemKeys = item.json ? Object.keys(item.json) : [];
      const cols = columnsParam
        ? columnsParam.split(",").map((c) => c.trim()).filter(Boolean)
        : itemKeys;
      if (cols.length === 0) throw new Error("Snowflake: no columns to insert");
      const values = cols.map((c) => item.json?.[c]);
      const placeholders = cols.map((_c, i) => `$${i + 1}`).join(", ");
      const sql = `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders})`;
      const result = await client.execute(sql, values);
      out.push({
        json: { affectedRows: result.rowCount ?? 1 },
        pairedItem: item.pairedItem ?? { item: index, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }
  return out;
}

async function updateOperation(
  ctx: Parameters<typeof snowflakeExecutor>[0],
  items: INodeExecutionData[],
  client: SnowflakeClient,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const table = String(ctx.getParam("table", "") ?? "");
      if (!table) throw new Error("Snowflake: table is required");
      const updateKey = String(ctx.getParam("updateKey", "") ?? "");
      if (!updateKey) throw new Error("Snowflake: updateKey is required");
      const columnsParam = ctx.getParam<string>("columns", "");
      const itemKeys = item.json ? Object.keys(item.json) : [];
      const cols = columnsParam
        ? columnsParam.split(",").map((c) => c.trim()).filter(Boolean)
        : itemKeys;
      const updateCols = cols.filter((c) => c !== updateKey);
      if (updateCols.length === 0) throw new Error("Snowflake: no columns to update");
      const params: unknown[] = [];
      const setParts = updateCols.map((c) => {
        params.push(item.json?.[c]);
        return `${quoteIdent(c)} = $${params.length}`;
      });
      params.push(item.json?.[updateKey]);
      const sql = `UPDATE ${quoteIdent(table)} SET ${setParts.join(", ")} WHERE ${quoteIdent(updateKey)} = $${params.length}`;
      const result = await client.execute(sql, params);
      out.push({
        json: { affectedRows: result.rowCount ?? 1 },
        pairedItem: item.pairedItem ?? { item: index, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }
  return out;
}
