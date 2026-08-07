import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { withPairedItem } from "@/sdk";

export interface TimescaleDbQueryResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string }>;
  rowCount?: number | null;
}

export interface TimescaleDbClient {
  query(sql: string, params?: unknown[]): Promise<TimescaleDbQueryResult>;
  end(): Promise<void>;
}

export type TimescaleDbClientFactory = (
  credentials: Record<string, unknown>,
) => Promise<TimescaleDbClient>;

let clientFactory: TimescaleDbClientFactory | null = null;

export function setTimescaleDbClientFactory(factory: TimescaleDbClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: TimescaleDbClientFactory = async (credentials) => {
  const { default: pg } = await import("pg");
  const Client = pg.Client;
  const sslMode = String(credentials.ssl ?? credentials.sslMode ?? "disable");
  const ssl =
    sslMode === "disable" || sslMode === "false"
      ? undefined
      : sslMode === "require" || sslMode === "allow"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true };

  const client = new Client({
    host: String(credentials.host ?? "localhost"),
    port: Number(credentials.port ?? 5432),
    user: String(credentials.user ?? credentials.username ?? "postgres"),
    password: String(credentials.password ?? ""),
    database: String(credentials.database ?? credentials.db ?? "timescaledb"),
    ssl,
  });
  await client.connect();

  return {
    async query(sql, params) {
      const result = await client.query(sql, params);
      return {
        rows: result.rows as Record<string, unknown>[],
        fields: result.fields?.map((f) => ({ name: f.name })),
        rowCount: result.rowCount,
      };
    },
    async end() {
      await client.end();
    },
  };
};

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseColumns(raw: string | undefined): string[] {
  if (!raw || String(raw).trim() === "") return [];
  return String(raw).split(",").map((c) => c.trim()).filter(Boolean);
}

function stripTypeSuffix(col: string): string {
  const idx = col.lastIndexOf(":");
  if (idx > 0) return col.substring(0, idx);
  return col;
}

async function getClient(ctx: ExecutionContext): Promise<TimescaleDbClient> {
  const cred = await ctx.getCredential?.("timescaleDb");
  if (!clientFactory) {
    const factory = DEFAULT_FACTORY;
    if (cred) return factory(cred);
    throw new Error('Credential "timescaleDb" is required');
  }
  return clientFactory(cred ?? {});
}

function handleExecuteQuery(
  query: string,
  queryParameters: string | undefined,
  item: INodeExecutionData,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  if (queryParameters) {
    const parts = String(queryParameters).split(",").map((p) => p.trim());
    for (const part of parts) {
      const resolved = part.startsWith("{{") || part.startsWith("=")
        ? item.json
        : part;
      params.push(resolved);
    }
  }
  return { sql: query, params };
}

function handleInsert(
  table: string,
  columns: string | undefined,
  schema: string,
  item: INodeExecutionData,
): { sql: string; params: unknown[] } {
  const qualified = schema ? `${quoteIdent(schema)}.${quoteIdent(table)}` : quoteIdent(table);
  const colList = parseColumns(columns);
  const cols: string[] = [];
  const params: unknown[] = [];

  if (colList.length > 0) {
    for (const col of colList) {
      const clean = stripTypeSuffix(col);
      cols.push(quoteIdent(clean));
      params.push(item.json[clean] ?? null);
    }
  } else {
    for (const [key, value] of Object.entries(item.json)) {
      cols.push(quoteIdent(key));
      params.push(value);
    }
  }

  if (cols.length === 0) {
    throw new Error("No columns to insert");
  }

  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  return {
    sql: `INSERT INTO ${qualified} (${cols.join(", ")}) VALUES (${placeholders})`,
    params,
  };
}

function handleUpdate(
  table: string,
  columns: string | undefined,
  schema: string,
  item: INodeExecutionData,
): { sql: string; params: unknown[] } {
  const qualified = schema ? `${quoteIdent(schema)}.${quoteIdent(table)}` : quoteIdent(table);
  const colList = parseColumns(columns);
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (colList.length > 0) {
    for (const col of colList) {
      const clean = stripTypeSuffix(col);
      setClauses.push(`${quoteIdent(clean)} = $${setClauses.length + 1}`);
      params.push(item.json[clean] ?? null);
    }
  } else {
    for (const [key, value] of Object.entries(item.json)) {
      setClauses.push(`${quoteIdent(key)} = $${setClauses.length + 1}`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) {
    throw new Error("No columns to update");
  }

  return {
    sql: `UPDATE ${qualified} SET ${setClauses.join(", ")}`,
    params,
  };
}

export const timescaleDbExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  if (inputItems.length === 0) return [[]];

  const operation = ctx.getParam<string>("operation", "executeQuery");
  const schema = ctx.getParam<string>("additionalFields.schema", "public");

  const client = await getClient(ctx);

  try {
    const outputItems: INodeExecutionData[] = [];

    for (let i = 0; i < inputItems.length; i++) {
      const item = inputItems[i];
      let result: TimescaleDbQueryResult;

      switch (operation) {
        case "executeQuery": {
          const query = ctx.getParam<string>("query", "");
          if (!query) throw new Error("query parameter is required for executeQuery operation");
          const queryParameters = ctx.getParam<string>("queryParameters", "");
          const { sql, params } = handleExecuteQuery(query, queryParameters, item);
          result = await client.query(sql, params.length > 0 ? params : undefined);
          const rowItems: INodeExecutionData[] = result.rows.map((row) => ({
            json: row,
          }));
          outputItems.push(...rowItems.map((ri, idx) => withPairedItem(ri, i)));
          break;
        }

        case "insert": {
          const table = ctx.getParam<string>("table", "");
          if (!table) throw new Error("table parameter is required for insert operation");
          const columns = ctx.getParam<string>("columns", "");
          const { sql, params } = handleInsert(table, columns, schema, item);
          result = await client.query(sql, params);
          outputItems.push(
            withPairedItem(
              { json: { affectedRows: result.rowCount ?? 1 } },
              i,
            ),
          );
          break;
        }

        case "update": {
          const table = ctx.getParam<string>("table", "");
          if (!table) throw new Error("table parameter is required for update operation");
          const columns = ctx.getParam<string>("columns", "");
          const { sql, params } = handleUpdate(table, columns, schema, item);
          result = await client.query(sql, params);
          outputItems.push(
            withPairedItem(
              { json: { affectedRows: result.rowCount ?? 1 } },
              i,
            ),
          );
          break;
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    }

    return [outputItems];
  } finally {
    await client.end();
  }
};
