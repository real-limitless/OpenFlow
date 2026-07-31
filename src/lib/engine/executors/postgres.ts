import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

export interface PostgresQueryResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string }>;
  rowCount?: number | null;
}

export interface PostgresClient {
  query(sql: string, params?: unknown[]): Promise<PostgresQueryResult>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  end(): Promise<void>;
}

export type PostgresClientFactory = (
  credentials: Record<string, unknown>,
  options: Record<string, unknown>,
) => Promise<PostgresClient>;

let clientFactory: PostgresClientFactory | null = null;

export function setPostgresClientFactory(factory: PostgresClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: PostgresClientFactory = async (credentials, options) => {
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
    database: String(credentials.database ?? credentials.db ?? "postgres"),
    connectionTimeoutMillis: Number(options.connectionTimeout ?? 30) * 1000,
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
    async begin() {
      await client.query("BEGIN");
    },
    async commit() {
      await client.query("COMMIT");
    },
    async rollback() {
      await client.query("ROLLBACK");
    },
    async end() {
      await client.end();
    },
  };
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>, itemIndex = 0): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson, itemIndex });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function locatorValue(raw: unknown, itemJson: Record<string, unknown>): string {
  if (raw == null) return "";
  if (typeof raw === "string") return String(resolveValue(raw, itemJson) ?? "");
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as { mode?: string; value?: unknown };
    return String(resolveValue(obj.value ?? "", itemJson) ?? "");
  }
  return String(raw);
}

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function qualifiedTable(schema: string, table: string): string {
  if (schema) return `${quoteIdent(schema)}.${quoteIdent(table)}`;
  return quoteIdent(table);
}

interface WhereEntry {
  column?: string;
  condition?: string;
  value?: unknown;
}

interface SortEntry {
  column?: string;
  direction?: string;
}

function extractFixedValues<T>(raw: unknown, key = "values"): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj[key])) return obj[key] as T[];
    if (Array.isArray(obj.value)) return obj.value as T[];
  }
  return [];
}

const OP_MAP: Record<string, string> = {
  equal: "=",
  "=": "=",
  "!=": "!=",
  LIKE: "LIKE",
  like: "LIKE",
  ">": ">",
  "<": "<",
  ">=": ">=",
  "<=": "<=",
  "IS NULL": "IS NULL",
  "IS NOT NULL": "IS NOT NULL",
};

function buildWhere(
  whereRaw: unknown,
  combine: string,
  itemJson: Record<string, unknown>,
  startIndex = 1,
): { sql: string; params: unknown[] } {
  const entries = extractFixedValues<WhereEntry>(whereRaw);
  if (entries.length === 0) return { sql: "", params: [] };

  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;
  const joiner = String(combine).toUpperCase() === "OR" ? " OR " : " AND ";

  for (const entry of entries) {
    const col = String(entry.column ?? "");
    if (!col) continue;
    const cond = String(entry.condition ?? "equal");
    const op = OP_MAP[cond] ?? cond;
    if (op === "IS NULL" || op === "IS NOT NULL") {
      parts.push(`${quoteIdent(col)} ${op}`);
    } else {
      const val = resolveValue(entry.value, itemJson);
      parts.push(`${quoteIdent(col)} ${op} $${idx}`);
      params.push(val);
      idx++;
    }
  }

  if (parts.length === 0) return { sql: "", params: [] };
  return { sql: ` WHERE ${parts.join(joiner)}`, params };
}

function buildOrderBy(sortRaw: unknown): string {
  const entries = extractFixedValues<SortEntry>(sortRaw);
  if (entries.length === 0) return "";
  const parts = entries
    .filter((e) => e.column)
    .map((e) => {
      const dir = String(e.direction ?? "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
      return `${quoteIdent(String(e.column))} ${dir}`;
    });
  if (parts.length === 0) return "";
  return ` ORDER BY ${parts.join(", ")}`;
}

function maybeNullEmpty(value: unknown, replaceEmpty: boolean): unknown {
  if (replaceEmpty && value === "") return null;
  return value;
}

function mapInsertValues(
  ctx: ExecutionContext,
  item: INodeExecutionData,
  dataMode: string,
): Record<string, unknown> {
  const replaceEmpty = Boolean(
    (ctx.getParam<Record<string, unknown>>("options", {}) ?? {}).replaceEmptyStrings,
  );
  if (dataMode === "defineBelow") {
    const valuesToSend = extractFixedValues<{ column?: string; value?: unknown }>(
      ctx.getParam("valuesToSend"),
    );
    const columnsParam = ctx.getParam("columns");
    if (valuesToSend.length > 0) {
      const out: Record<string, unknown> = {};
      for (const v of valuesToSend) {
        if (!v.column) continue;
        out[v.column] = maybeNullEmpty(resolveValue(v.value, item.json), replaceEmpty);
      }
      return out;
    }
    if (columnsParam && typeof columnsParam === "object" && !Array.isArray(columnsParam)) {
      const rm = columnsParam as { value?: Record<string, unknown> | null };
      if (rm.value && typeof rm.value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rm.value)) {
          out[k] = maybeNullEmpty(resolveValue(v, item.json), replaceEmpty);
        }
        return out;
      }
    }
    return {};
  }
  // autoMapInputData
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item.json ?? {})) {
    out[k] = maybeNullEmpty(v, replaceEmpty);
  }
  return out;
}

function projectColumns(
  row: Record<string, unknown>,
  outputColumns: unknown,
): Record<string, unknown> {
  if (!Array.isArray(outputColumns) || outputColumns.length === 0) return row;
  const cols = outputColumns.map(String);
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    if (c in row) out[c] = row[c];
  }
  return out;
}

function resultToColumnsRows(result: PostgresQueryResult): {
  columns: string[];
  rows: unknown[][];
} {
  const columns =
    result.fields?.map((f) => f.name) ??
    (result.rows[0] ? Object.keys(result.rows[0]) : []);
  const rows = result.rows.map((r) => columns.map((c) => r[c]));
  return { columns, rows };
}

/** Apply $N:name identifier substitution and collect value params. */
function prepareQuery(
  query: string,
  replacements: unknown[],
  treatQuotedAsText: boolean,
): { sql: string; params: unknown[] } {
  let sql = query;
  const params: unknown[] = [];
  let valueIndex = 0;

  // Replace $N:name with quoted identifier from replacements[N-1]
  sql = sql.replace(/\$(\d+):name\b/g, (_m, nStr: string) => {
    const n = Number(nStr);
    const val = replacements[n - 1];
    return quoteIdent(String(val ?? ""));
  });

  // Optionally leave '$N' inside single quotes as literal text
  if (treatQuotedAsText) {
    // placeholders inside single quotes stay as-is (already text)
  }

  // Map remaining $N placeholders to sequential params from unused replacements
  const usedIdent = new Set<number>();
  for (const m of query.matchAll(/\$(\d+):name\b/g)) {
    usedIdent.add(Number(m[1]));
  }

  const valueReplacements = replacements.filter((_, i) => !usedIdent.has(i + 1));

  sql = sql.replace(/\$(\d+)\b(?!:)/g, () => {
    valueIndex++;
    return `$${valueIndex}`;
  });

  // Collect params in order of appearance of $N (non-:name) in original query
  const ordered: unknown[] = [];
  for (const m of query.matchAll(/\$(\d+)\b(?!:)/g)) {
    const n = Number(m[1]);
    // Index among value params: count how many non-ident params have index < n
    let vi = 0;
    for (let i = 1; i <= n; i++) {
      if (!usedIdent.has(i)) vi++;
    }
    ordered.push(valueReplacements[vi - 1]);
  }
  // Prefer ordered values if we found placeholders; else all value replacements
  const finalParams = ordered.length > 0 ? ordered : valueReplacements;
  for (const p of finalParams) params.push(p);

  return { sql, params };
}

function parseQueryReplacement(
  raw: unknown,
  itemJson: Record<string, unknown>,
  itemIndex: number,
): unknown[] {
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

async function runWithBatching(
  client: PostgresClient,
  batching: string,
  tasks: Array<() => Promise<INodeExecutionData[]>>,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];

  if (batching === "transaction") {
    await client.begin();
    try {
      for (const task of tasks) {
        const items = await task();
        out.push(...items);
      }
      await client.commit();
    } catch (err) {
      await client.rollback().catch(() => {});
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
        });
        return out;
      }
      throw err;
    }
    return out;
  }

  // single or independently — tasks already encode batching granularity
  for (const task of tasks) {
    try {
      const items = await task();
      out.push(...items);
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
        });
      } else {
        throw err;
      }
    }
  }
  return out;
}

export const postgresExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "select");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const batching = String(options.queryBatching ?? "single");
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("postgres");
  if (!credentials) {
    throw new Error('Postgres: credential "postgres" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials, options);

  try {
    switch (operation) {
      case "executeQuery":
        return [await executeQuery(ctx, items, client, options, batching, continueOnFail)];
      case "insert":
        return [await runInsert(ctx, items, client, options, batching, continueOnFail)];
      case "update":
        return [await runUpdate(ctx, items, client, options, batching, continueOnFail)];
      case "upsert":
        return [await runUpsert(ctx, items, client, options, batching, continueOnFail)];
      case "select":
        return [await runSelect(ctx, items, client, options, continueOnFail)];
      case "deleteTable":
        return [await runDeleteTable(ctx, items, client, options, continueOnFail)];
      default:
        throw new Error(`Postgres: unknown operation "${operation}"`);
    }
  } finally {
    await client.end().catch(() => {});
  }
};

async function executeQuery(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: PostgresClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const treatQuoted = Boolean(options.treatQueryParametersInSingleQuotesAsText);
  const queryReplacementRaw = options.queryReplacement ?? "";

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const query = String(resolveValue(ctx.getParam("query", ""), item.json, index) ?? "");
    if (!query) throw new Error("Postgres: query is required");
    const replacements = parseQueryReplacement(queryReplacementRaw, item.json, index);
    const { sql, params } = prepareQuery(query, replacements, treatQuoted);
    if (!/\$\d+/.test(query) && !query.includes("$")) {
      // hint only — still execute
    }
    const result = await client.query(sql, params);
    const shaped = resultToColumnsRows(result);
    return [
      {
        json: shaped as unknown as Record<string, unknown>,
        pairedItem: item.pairedItem ?? { item: index, input: 0 },
      },
    ];
  };

  if (batching === "single") {
    // one query using first item context (or empty)
    const item = items[0] ?? { json: {} };
    try {
      return await runOne(item, 0);
    } catch (err) {
      if (continueOnFail) {
        return [{ json: { error: err instanceof Error ? err.message : String(err) } }];
      }
      throw err;
    }
  }

  const tasks = items.map((item, i) => () => runOne(item, i));
  return runWithBatching(client, batching, tasks, continueOnFail);
}

async function runInsert(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: PostgresClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const dataMode = ctx.getParam<string>("dataMode", "autoMapInputData");
  const skipOnConflict = Boolean(options.skipOnConflict);
  const outputColumns = options.outputColumns;

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const schema = locatorValue(ctx.getParam("schema", { mode: "list", value: "public" }), item.json);
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
    if (!table) throw new Error("Postgres: table is required");
    const values = mapInsertValues(ctx, item, dataMode);
    const cols = Object.keys(values);
    if (cols.length === 0) throw new Error("Postgres: no columns to insert");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const returning =
      Array.isArray(outputColumns) && outputColumns.length > 0
        ? outputColumns.map((c) => quoteIdent(String(c))).join(", ")
        : "*";
    let sql = `INSERT INTO ${qualifiedTable(schema, table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders})`;
    if (skipOnConflict) sql += " ON CONFLICT DO NOTHING";
    sql += ` RETURNING ${returning}`;
    const result = await client.query(
      sql,
      cols.map((c) => values[c]),
    );
    if (result.rows.length === 0) {
      return [{ json: {}, pairedItem: item.pairedItem ?? { item: index, input: 0 } }];
    }
    return result.rows.map((row) => ({
      json: projectColumns(row, outputColumns),
      pairedItem: item.pairedItem ?? { item: index, input: 0 },
    }));
  };

  if (batching === "single" && items.length > 1) {
    // multi-row insert from all items
    const first = items[0];
    const schema = locatorValue(ctx.getParam("schema", { mode: "list", value: "public" }), first.json);
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), first.json);
    if (!table) throw new Error("Postgres: table is required");
    const allValues = items.map((item) => mapInsertValues(ctx, item, dataMode));
    const cols = Object.keys(allValues[0] ?? {});
    if (cols.length === 0) throw new Error("Postgres: no columns to insert");
    const params: unknown[] = [];
    const rowPlaceholders = allValues.map((vals, ri) => {
      const ph = cols.map((c, ci) => {
        params.push(vals[c]);
        return `$${ri * cols.length + ci + 1}`;
      });
      return `(${ph.join(", ")})`;
    });
    const returning =
      Array.isArray(outputColumns) && outputColumns.length > 0
        ? outputColumns.map((c) => quoteIdent(String(c))).join(", ")
        : "*";
    let sql = `INSERT INTO ${qualifiedTable(schema, table)} (${cols.map(quoteIdent).join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
    if (skipOnConflict) sql += " ON CONFLICT DO NOTHING";
    sql += ` RETURNING ${returning}`;
    try {
      const result = await client.query(sql, params);
      return result.rows.map((row, i) => ({
        json: projectColumns(row, outputColumns),
        pairedItem: items[i]?.pairedItem ?? { item: i, input: 0 },
      }));
    } catch (err) {
      if (continueOnFail) {
        return [{ json: { error: err instanceof Error ? err.message : String(err) } }];
      }
      throw err;
    }
  }

  const tasks = items.map((item, i) => () => runOne(item, i));
  return runWithBatching(client, batching === "single" ? "independently" : batching, tasks, continueOnFail);
}

async function runUpdate(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: PostgresClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const dataMode = ctx.getParam<string>("dataMode", "autoMapInputData");
  const outputColumns = options.outputColumns;

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const schema = locatorValue(ctx.getParam("schema", { mode: "list", value: "public" }), item.json);
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
    if (!table) throw new Error("Postgres: table is required");
    const matchCol = String(ctx.getParam("columnToMatchOn", "") ?? "");
    if (!matchCol) throw new Error("Postgres: columnToMatchOn is required");
    const values = mapInsertValues(ctx, item, dataMode);
    let matchVal = resolveValue(ctx.getParam("valueToMatchOn", ""), item.json);
    if (matchVal === "" || matchVal == null) {
      matchVal = values[matchCol];
    }
    const setCols = Object.keys(values).filter((c) => c !== matchCol);
    if (setCols.length === 0) throw new Error("Postgres: no columns to update");
    const params: unknown[] = [];
    const setParts = setCols.map((c, i) => {
      params.push(values[c]);
      return `${quoteIdent(c)} = $${i + 1}`;
    });
    params.push(matchVal);
    const returning =
      Array.isArray(outputColumns) && outputColumns.length > 0
        ? outputColumns.map((c) => quoteIdent(String(c))).join(", ")
        : "*";
    const sql = `UPDATE ${qualifiedTable(schema, table)} SET ${setParts.join(", ")} WHERE ${quoteIdent(matchCol)} = $${params.length} RETURNING ${returning}`;
    const result = await client.query(sql, params);
    return result.rows.map((row) => ({
      json: projectColumns(row, outputColumns),
      pairedItem: item.pairedItem ?? { item: index, input: 0 },
    }));
  };

  const tasks = items.map((item, i) => () => runOne(item, i));
  return runWithBatching(
    client,
    batching === "single" ? "independently" : batching,
    tasks,
    continueOnFail,
  );
}

async function runUpsert(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: PostgresClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const dataMode = ctx.getParam<string>("dataMode", "autoMapInputData");
  const outputColumns = options.outputColumns;

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const schema = locatorValue(ctx.getParam("schema", { mode: "list", value: "public" }), item.json);
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
    if (!table) throw new Error("Postgres: table is required");
    const matchCol = String(ctx.getParam("columnToMatchOn", "") ?? "");
    if (!matchCol) throw new Error("Postgres: columnToMatchOn is required");
    const values = mapInsertValues(ctx, item, dataMode);
    if (!(matchCol in values)) {
      const matchVal = resolveValue(ctx.getParam("valueToMatchOn", ""), item.json);
      if (matchVal !== "" && matchVal != null) values[matchCol] = matchVal;
    }
    const cols = Object.keys(values);
    if (cols.length === 0) throw new Error("Postgres: no columns to upsert");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const updateCols = cols.filter((c) => c !== matchCol);
    const setParts =
      updateCols.length > 0
        ? updateCols.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")
        : `${quoteIdent(matchCol)} = EXCLUDED.${quoteIdent(matchCol)}`;
    const returning =
      Array.isArray(outputColumns) && outputColumns.length > 0
        ? outputColumns.map((c) => quoteIdent(String(c))).join(", ")
        : "*";
    const sql = `INSERT INTO ${qualifiedTable(schema, table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders}) ON CONFLICT (${quoteIdent(matchCol)}) DO UPDATE SET ${setParts} RETURNING ${returning}`;
    const result = await client.query(
      sql,
      cols.map((c) => values[c]),
    );
    return result.rows.map((row) => ({
      json: projectColumns(row, outputColumns),
      pairedItem: item.pairedItem ?? { item: index, input: 0 },
    }));
  };

  const tasks = items.map((item, i) => () => runOne(item, i));
  return runWithBatching(
    client,
    batching === "single" ? "independently" : batching,
    tasks,
    continueOnFail,
  );
}

async function runSelect(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: PostgresClient,
  options: Record<string, unknown>,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const outputColumns = options.outputColumns;
  const out: INodeExecutionData[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const schema = locatorValue(
        ctx.getParam("schema", { mode: "list", value: "public" }),
        item.json,
      );
      const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
      if (!table) throw new Error("Postgres: table is required");
      const returnAll = Boolean(ctx.getParam("returnAll", false));
      const limitRaw = resolveValue(ctx.getParam("limit", 50), item.json);
      const limit = Number(limitRaw ?? 50);
      const combine = String(ctx.getParam("combineConditions", "AND") ?? "AND");
      const where = buildWhere(ctx.getParam("where"), combine, item.json, 1);
      const orderBy = buildOrderBy(ctx.getParam("sort"));
      let selectList = "*";
      if (Array.isArray(outputColumns) && outputColumns.length > 0) {
        selectList = outputColumns.map((c) => quoteIdent(String(c))).join(", ");
      }
      let sql = `SELECT ${selectList} FROM ${qualifiedTable(schema, table)}${where.sql}${orderBy}`;
      const params = [...where.params];
      if (!returnAll) {
        params.push(limit);
        sql += ` LIMIT $${params.length}`;
      }
      const result = await client.query(sql, params);
      if (result.rows.length === 0) {
        // no rows — still produce nothing for this item (or empty)
        continue;
      }
      for (const row of result.rows) {
        out.push({
          json: projectColumns(row, outputColumns),
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

async function runDeleteTable(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: PostgresClient,
  options: Record<string, unknown>,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  const cascade = Boolean(options.cascade);
  const deleteCommand = ctx.getParam<string>("deleteCommand", "truncate");
  const restartSequences = Boolean(ctx.getParam("restartSequences", false));

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const schema = locatorValue(
        ctx.getParam("schema", { mode: "list", value: "public" }),
        item.json,
      );
      const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
      if (!table) throw new Error("Postgres: table is required");
      const qt = qualifiedTable(schema, table);

      if (deleteCommand === "drop") {
        let sql = `DROP TABLE ${qt}`;
        if (cascade) sql += " CASCADE";
        await client.query(sql);
      } else if (deleteCommand === "delete") {
        const combine = String(ctx.getParam("combineConditions", "AND") ?? "AND");
        const where = buildWhere(ctx.getParam("where"), combine, item.json, 1);
        await client.query(`DELETE FROM ${qt}${where.sql}`, where.params);
      } else {
        // truncate
        let sql = `TRUNCATE TABLE ${qt}`;
        if (restartSequences) sql += " RESTART IDENTITY";
        if (cascade) sql += " CASCADE";
        await client.query(sql);
      }
      out.push({
        json: {},
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
