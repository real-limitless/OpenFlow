import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

export interface MySqlQueryResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string }>;
  affectedRows?: number;
  insertId?: number;
}

export interface MySqlClient {
  query(sql: string, params?: unknown[]): Promise<MySqlQueryResult>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  end(): Promise<void>;
}

export type MySqlClientFactory = (
  credentials: Record<string, unknown>,
  options: Record<string, unknown>,
) => Promise<MySqlClient>;

let clientFactory: MySqlClientFactory | null = null;

export function setMySqlClientFactory(factory: MySqlClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: MySqlClientFactory = async (credentials, options) => {
  const mysql = await import("mysql2/promise");
  const sslMode = String(credentials.ssl ?? credentials.sslMode ?? "disable");
  const ssl =
    sslMode === "disable" || sslMode === "false"
      ? undefined
      : sslMode === "require" || sslMode === "allow"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true };

  const connectionTimeout = Number(
    options.connectionTimeoutMillis ?? options.connectionTimeout ?? 30,
  );
  const decimalNumbers = Boolean(options.decimalNumbers);
  const largeNumbersOutput = String(options.largeNumbersOutput ?? "text");

  const conn = await mysql.createConnection({
    host: String(credentials.host ?? "localhost"),
    port: Number(credentials.port ?? 3306),
    user: String(credentials.user ?? credentials.username ?? "root"),
    password: String(credentials.password ?? ""),
    database: String(credentials.database ?? credentials.db ?? ""),
    connectTimeout: connectionTimeout * 1000,
    ssl,
    decimalNumbers,
    supportBigNumbers: true,
    bigNumberStrings: largeNumbersOutput !== "numbers",
  });

  return {
    async query(sql, params) {
      const [rows, fields] = await conn.query(sql, params ?? []);
      if (Array.isArray(rows)) {
        const list = rows as Record<string, unknown>[];
        return {
          rows: list,
          fields: Array.isArray(fields)
            ? (fields as Array<{ name: string }>).map((f) => ({ name: f.name }))
            : undefined,
        };
      }
      const header = rows as { affectedRows?: number; insertId?: number };
      return {
        rows: [],
        affectedRows: header.affectedRows,
        insertId: header.insertId,
      };
    },
    async begin() {
      await conn.beginTransaction();
    },
    async commit() {
      await conn.commit();
    },
    async rollback() {
      await conn.rollback();
    },
    async end() {
      await conn.end();
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
  return `\`${String(name).replace(/`/g, "``")}\``;
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
): { sql: string; params: unknown[] } {
  const entries = extractFixedValues<WhereEntry>(whereRaw);
  if (entries.length === 0) return { sql: "", params: [] };

  const parts: string[] = [];
  const params: unknown[] = [];
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
      parts.push(`${quoteIdent(col)} ${op} ?`);
      params.push(val);
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

/** Apply $N:name identifier substitution; convert $N value placeholders to `?`. */
function prepareQuery(
  query: string,
  replacements: unknown[],
): { sql: string; params: unknown[] } {
  let sql = query;

  sql = sql.replace(/\$(\d+):name\b/g, (_m, nStr: string) => {
    const n = Number(nStr);
    const val = replacements[n - 1];
    return quoteIdent(String(val ?? ""));
  });

  const usedIdent = new Set<number>();
  for (const m of query.matchAll(/\$(\d+):name\b/g)) {
    usedIdent.add(Number(m[1]));
  }

  const valueReplacements = replacements.filter((_, i) => !usedIdent.has(i + 1));

  const ordered: unknown[] = [];
  sql = sql.replace(/\$(\d+)\b(?!:)/g, (_m, nStr: string) => {
    const n = Number(nStr);
    let vi = 0;
    for (let i = 1; i <= n; i++) {
      if (!usedIdent.has(i)) vi++;
    }
    ordered.push(valueReplacements[vi - 1]);
    return "?";
  });

  const finalParams = ordered.length > 0 ? ordered : valueReplacements;
  return { sql, params: finalParams };
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
  client: MySqlClient,
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

export const mySqlExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "insert");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const batching = String(options.queryBatching ?? "single");
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("mySql");
  if (!credentials) {
    throw new Error('MySQL: credential "mySql" is not configured on this node');
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
        return [await runDeleteTable(ctx, items, client, continueOnFail)];
      default:
        throw new Error(`MySQL: unknown operation "${operation}"`);
    }
  } finally {
    await client.end().catch(() => {});
  }
};

async function executeQuery(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: MySqlClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const queryReplacementRaw = options.queryReplacement ?? "";

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const query = String(resolveValue(ctx.getParam("query", ""), item.json, index) ?? "");
    if (!query) throw new Error("MySQL: query is required");
    const replacements = parseQueryReplacement(queryReplacementRaw, item.json, index);
    const { sql, params } = prepareQuery(query, replacements);
    const result = await client.query(sql, params);
    if (result.rows.length === 0) {
      return [
        {
          json: {},
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        },
      ];
    }
    return result.rows.map((row) => ({
      json: row,
      pairedItem: item.pairedItem ?? { item: index, input: 0 },
    }));
  };

  if (batching === "single") {
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
  client: MySqlClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const dataMode = ctx.getParam<string>("dataMode", "autoMapInputData");
  const skipOnConflict = Boolean(options.skipOnConflict);
  const priority = String(options.priority ?? "").toUpperCase();
  const outputColumns = options.outputColumns;
  const priorityKw =
    priority === "HIGH_PRIORITY" || priority === "LOW_PRIORITY" ? `${priority} ` : "";
  const insertKw = skipOnConflict ? "INSERT IGNORE" : "INSERT";

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
    if (!table) throw new Error("MySQL: table is required");
    const values = mapInsertValues(ctx, item, dataMode);
    const cols = Object.keys(values);
    if (cols.length === 0) throw new Error("MySQL: no columns to insert");
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `${insertKw} ${priorityKw}INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders})`;
    await client.query(
      sql,
      cols.map((c) => values[c]),
    );
    return [
      {
        json: projectColumns(values, outputColumns),
        pairedItem: item.pairedItem ?? { item: index, input: 0 },
      },
    ];
  };

  if (batching === "single" && items.length > 1) {
    const first = items[0];
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), first.json);
    if (!table) throw new Error("MySQL: table is required");
    const allValues = items.map((item) => mapInsertValues(ctx, item, dataMode));
    const cols = Object.keys(allValues[0] ?? {});
    if (cols.length === 0) throw new Error("MySQL: no columns to insert");
    const params: unknown[] = [];
    const rowPlaceholders = allValues.map((vals) => {
      const ph = cols.map((c) => {
        params.push(vals[c]);
        return "?";
      });
      return `(${ph.join(", ")})`;
    });
    const sql = `${insertKw} ${priorityKw}INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
    try {
      await client.query(sql, params);
      return allValues.map((vals, i) => ({
        json: projectColumns(vals, outputColumns),
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
  return runWithBatching(
    client,
    batching === "single" ? "independently" : batching,
    tasks,
    continueOnFail,
  );
}

async function runUpdate(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: MySqlClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const dataMode = ctx.getParam<string>("dataMode", "autoMapInputData");
  const outputColumns = options.outputColumns;

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
    if (!table) throw new Error("MySQL: table is required");
    const matchCol = String(ctx.getParam("columnToMatchOn", "") ?? "");
    if (!matchCol) throw new Error("MySQL: columnToMatchOn is required");
    const values = mapInsertValues(ctx, item, dataMode);
    let matchVal = resolveValue(ctx.getParam("valueToMatchOn", ""), item.json);
    if (matchVal === "" || matchVal == null) {
      matchVal = values[matchCol];
    }
    const setCols = Object.keys(values).filter((c) => c !== matchCol);
    if (setCols.length === 0) throw new Error("MySQL: no columns to update");
    const params: unknown[] = [];
    const setParts = setCols.map((c) => {
      params.push(values[c]);
      return `${quoteIdent(c)} = ?`;
    });
    params.push(matchVal);
    const sql = `UPDATE ${quoteIdent(table)} SET ${setParts.join(", ")} WHERE ${quoteIdent(matchCol)} = ?`;
    await client.query(sql, params);
    const outRow: Record<string, unknown> = { ...values, [matchCol]: matchVal };
    return [
      {
        json: projectColumns(outRow, outputColumns),
        pairedItem: item.pairedItem ?? { item: index, input: 0 },
      },
    ];
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
  client: MySqlClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const dataMode = ctx.getParam<string>("dataMode", "autoMapInputData");
  const outputColumns = options.outputColumns;

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
    if (!table) throw new Error("MySQL: table is required");
    const matchCol = String(ctx.getParam("columnToMatchOn", "") ?? "");
    if (!matchCol) throw new Error("MySQL: columnToMatchOn is required");
    const values = mapInsertValues(ctx, item, dataMode);
    if (!(matchCol in values)) {
      const matchVal = resolveValue(ctx.getParam("valueToMatchOn", ""), item.json);
      if (matchVal !== "" && matchVal != null) values[matchCol] = matchVal;
    }
    const cols = Object.keys(values);
    if (cols.length === 0) throw new Error("MySQL: no columns to upsert");
    const placeholders = cols.map(() => "?").join(", ");
    const updateCols = cols.filter((c) => c !== matchCol);
    const setParts =
      updateCols.length > 0
        ? updateCols.map((c) => `${quoteIdent(c)} = VALUES(${quoteIdent(c)})`).join(", ")
        : `${quoteIdent(matchCol)} = VALUES(${quoteIdent(matchCol)})`;
    const sql = `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${setParts}`;
    await client.query(
      sql,
      cols.map((c) => values[c]),
    );
    return [
      {
        json: projectColumns(values, outputColumns),
        pairedItem: item.pairedItem ?? { item: index, input: 0 },
      },
    ];
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
  client: MySqlClient,
  options: Record<string, unknown>,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const outputColumns = options.outputColumns;
  const selectDistinct = Boolean(options.selectDistinct);
  const out: INodeExecutionData[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
      if (!table) throw new Error("MySQL: table is required");
      const returnAll = Boolean(ctx.getParam("returnAll", false));
      const limitRaw = resolveValue(ctx.getParam("limit", 50), item.json);
      const limit = Number(limitRaw ?? 50);
      const combine = String(ctx.getParam("combineConditions", "AND") ?? "AND");
      const where = buildWhere(ctx.getParam("where"), combine, item.json);
      const orderBy = buildOrderBy(ctx.getParam("sort"));
      let selectList = "*";
      if (Array.isArray(outputColumns) && outputColumns.length > 0) {
        selectList = outputColumns.map((c) => quoteIdent(String(c))).join(", ");
      }
      const distinct = selectDistinct ? "DISTINCT " : "";
      let sql = `SELECT ${distinct}${selectList} FROM ${quoteIdent(table)}${where.sql}${orderBy}`;
      const params = [...where.params];
      if (!returnAll) {
        sql += ` LIMIT ?`;
        params.push(limit);
      }
      const result = await client.query(sql, params);
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
  client: MySqlClient,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];
  const deleteCommand = ctx.getParam<string>("deleteCommand", "truncate");

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
      if (!table) throw new Error("MySQL: table is required");
      const qt = quoteIdent(table);

      if (deleteCommand === "drop") {
        await client.query(`DROP TABLE ${qt}`);
        out.push({
          json: {},
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      } else if (deleteCommand === "delete") {
        const combine = String(ctx.getParam("combineConditions", "AND") ?? "AND");
        const where = buildWhere(ctx.getParam("where"), combine, item.json);
        const result = await client.query(`DELETE FROM ${qt}${where.sql}`, where.params);
        out.push({
          json: { affectedRows: result.affectedRows ?? 0 },
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      } else {
        await client.query(`TRUNCATE TABLE ${qt}`);
        out.push({
          json: {},
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
