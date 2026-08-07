import type { NodeExecutor, ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";

export interface QuestDbQueryResult {
  rows: Record<string, unknown>[];
  fields: { name: string }[];
}

export interface QuestDbClient {
  query(sql: string, params?: unknown[]): Promise<QuestDbQueryResult>;
  end(): Promise<void>;
}

export type QuestDbClientFactory = (creds: Record<string, unknown>) => Promise<QuestDbClient>;

const DEFAULT_FACTORY: QuestDbClientFactory = () => {
  throw new Error(
    "QuestDB executor is unavailable because no PGWire transport (pg) was wired. " +
      "Call setQuestDbClientFactory(…{pg}) from the host process before workflows start.",
  );
};

let clientFactory: QuestDbClientFactory = DEFAULT_FACTORY;

export function setQuestDbClientFactory(factory: QuestDbClientFactory | null): void {
  clientFactory = factory ?? DEFAULT_FACTORY;
}

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseInsertColumns(columns: string): { name: string; type?: string }[] {
  if (!columns.trim()) return [];
  return columns.split(",").map((col) => {
    const trimmed = col.trim();
    const colon = trimmed.lastIndexOf(":");
    if (colon > 0) {
      return { name: trimmed.slice(0, colon), type: trimmed.slice(colon + 1) };
    }
    return { name: trimmed };
  });
}

export const questDbExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "executeQuery");
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("questDb");
  if (!credentials) {
    throw new Error('Required credential "questDb" not found for QuestDB node.');
  }

  const client = await clientFactory(credentials as Record<string, unknown>);

  try {
    switch (operation) {
      case "executeQuery":
        return [await executeQueryOperation(ctx, items, client, continueOnFail)];
      case "insert":
        return [await insertOperation(ctx, items, client, continueOnFail)];
      default:
        throw new Error(`QuestDB: unknown operation "${operation}"`);
    }
  } finally {
    await client.end().catch(() => {});
  }
};

async function executeQueryOperation(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: QuestDbClient,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const query = String(ctx.evaluate(String(ctx.getParam("query", "") ?? ""), item.json) ?? "");
      if (!query) throw new Error("QuestDB: query is required");

      const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {}) ?? {};
      const queryParamsRaw = additionalFields.queryParameters;
      let params: string[] = [];
      if (queryParamsRaw) {
        const resolved = String(ctx.evaluate(String(queryParamsRaw), item.json) ?? "");
        params = resolved
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const result = await client.query(query, params.length > 0 ? params : undefined);

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
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: QuestDbClient,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const table = String(ctx.getParam("table", "") ?? "");
      if (!table) throw new Error("QuestDB: table is required");

      const columnsRaw = ctx.getParam<string>("columns", "") ?? "";
      const inputData = item.json ?? {};

      let colDefs: { name: string; type?: string }[];
      if (columnsRaw.trim().length > 0) {
        colDefs = parseInsertColumns(columnsRaw);
      } else {
        colDefs = Object.keys(inputData).map((k) => ({ name: k }));
      }

      if (colDefs.length === 0) throw new Error("QuestDB: no columns to insert");

      const colNames = colDefs.map((c) => c.name);
      const values = colNames.map((n) => inputData[n]);
      const placeholders = colNames.map((_c, i) => `$${i + 1}`).join(", ");
      const quotedCols = colNames.map(quoteIdent).join(", ");

      const sql = `INSERT INTO ${quoteIdent(table)} (${quotedCols}) VALUES (${placeholders})`;
      await client.query(sql, values);

      out.push({
        json: { affectedRows: 1 },
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
