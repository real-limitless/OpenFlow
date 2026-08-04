import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

interface CrateDbQueryResult {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
}

interface CrateDbClient {
  execute(sql: string, params?: unknown[]): Promise<CrateDbQueryResult>;
  close(): Promise<void>;
}

export type CrateDbClientFactory = (
  credentials: Record<string, unknown>,
  options: Record<string, unknown>,
) => Promise<CrateDbClient>;

let clientFactory: CrateDbClientFactory | null = null;

export function setCrateDbClientFactory(factory: CrateDbClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: CrateDbClientFactory = async (_credentials, _options) => {
  throw new Error(
    "CrateDB client is not configured. Call setCrateDbClientFactory() with a CrateDB driver wrapper.",
  );
};

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseColumnDef(col: string): { name: string; hint?: string } {
  const trimmed = col.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    return { name: trimmed.slice(0, colonIdx).trim(), hint: trimmed.slice(colonIdx + 1).trim() };
  }
  return { name: trimmed };
}

function parseQueryParameters(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export const crateDbExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "executeQuery");
  const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {}) ?? {};
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("crateDb");
  if (!credentials) {
    throw new Error('CrateDB: credential "crateDb" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials, additionalFields);

  const query = String(ctx.getParam("query", "") ?? "");

  try {
    switch (operation) {
      case "executeQuery":
        return [await executeQueryOperation(items, query, client, additionalFields, continueOnFail)];
      case "insert":
        return [await insertOperation(ctx, items, client, continueOnFail)];
      case "update":
        return [await updateOperation(ctx, items, client, continueOnFail)];
      default:
        throw new Error(`CrateDB: unknown operation "${operation}"`);
    }
  } finally {
    await client.close().catch(() => {});
  }
};

async function executeQueryOperation(
  items: INodeExecutionData[],
  query: string,
  client: CrateDbClient,
  additionalFields: Record<string, unknown>,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      if (!query) throw new Error("CrateDB: query is required");
      if (!query) throw new Error("CrateDB: query is required");
      const queryParamsRaw = additionalFields.queryParams;
      const params = queryParamsRaw ? parseQueryParameters(queryParamsRaw) : [];
      const boundParams = params.map((p) => item.json?.[p]);
      const result = await client.execute(query, boundParams);
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
  ctx: Parameters<typeof crateDbExecutor>[0],
  items: INodeExecutionData[],
  client: CrateDbClient,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const schema = String(ctx.getParam("schema", "doc") ?? "doc");
      const table = String(ctx.getParam("table", "") ?? "");
      if (!table) throw new Error("CrateDB: table is required");
      const columnsParam = ctx.getParam<string>("columns", "");
      const returnFields = String(ctx.getParam("returnFields", "*") ?? "*");
      const colDefs = columnsParam
        ? columnsParam.split(",").map(parseColumnDef).filter((c) => c.name)
        : Object.keys(item.json ?? {}).map((k) => ({ name: k }));
      if (colDefs.length === 0) throw new Error("CrateDB: no columns to insert");
      const colNames = colDefs.map((c) => c.name);
      const values = colNames.map((c) => item.json?.[c]);
      const placeholders = colNames.map((_c, i) => `$${i + 1}`).join(", ");
      const quotedCols = colNames.map(quoteIdent).join(", ");
      const sql = `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${quotedCols}) VALUES (${placeholders}) RETURNING ${returnFields === "*" ? "*" : returnFields.split(",").map((f) => quoteIdent(f.trim())).filter(Boolean).join(", ")}`;
      const result = await client.execute(sql, values);
      if (result.rows.length > 0) {
        out.push({
          json: result.rows[0],
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      } else {
        out.push({
          json: { affectedRows: result.rowCount ?? 1 },
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

async function updateOperation(
  ctx: Parameters<typeof crateDbExecutor>[0],
  items: INodeExecutionData[],
  client: CrateDbClient,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {}) ?? {};
  const mode = String(additionalFields.mode ?? "multiple");

  const schema = String(ctx.getParam("schema", "doc") ?? "doc");
  const table = String(ctx.getParam("table", "") ?? "");
  const columnsParam = ctx.getParam<string>("columns", "");
  const updateKeyParam = String(ctx.getParam("updateKey", "id") ?? "id");
  const returnFields = String(ctx.getParam("returnFields", "*") ?? "*");

  if (!table) throw new Error("CrateDB: table is required");

  const updateKeys = updateKeyParam.split(",").map((k) => k.trim()).filter(Boolean);
  if (updateKeys.length === 0) throw new Error("CrateDB: updateKey is required");

  const colDefs = columnsParam
    ? columnsParam.split(",").map(parseColumnDef).filter((c) => c.name)
    : [];

  const sqlStatements: string[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const itemKeys = item.json ? Object.keys(item.json) : [];
      const cols = colDefs.length > 0
        ? colDefs.map((c) => c.name)
        : itemKeys.filter((k) => !updateKeys.includes(k));
      const updateCols = cols.filter((c) => !updateKeys.includes(c));
      if (updateCols.length === 0) throw new Error("CrateDB: no columns to update");
      const params: unknown[] = [];
      const setParts = updateCols.map((c) => {
        params.push(item.json?.[c]);
        return `${quoteIdent(c)} = $${params.length}`;
      });
      const whereParts = updateKeys.map((k) => {
        params.push(item.json?.[k]);
        return `${quoteIdent(k)} = $${params.length}`;
      });
      const returnClause = returnFields === "*" ? "RETURNING *" : `RETURNING ${returnFields.split(",").map((f) => quoteIdent(f.trim())).filter(Boolean).join(", ")}`;
      const sql = `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setParts.join(", ")} WHERE ${whereParts.join(" AND ")} ${returnClause}`;

      if (mode === "multiple") {
        sqlStatements.push(sql);
      }

      const clientToUse = client;
      const result = await clientToUse.execute(sql, params);
      if (result.rows.length > 0) {
        out.push({
          json: result.rows[0],
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      } else {
        out.push({
          json: { affectedRows: result.rowCount ?? 1 },
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


