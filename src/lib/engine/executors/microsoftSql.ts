import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

export interface MssqlQueryResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string }>;
  rowCount?: number;
}

export interface MssqlClient {
  query(sql: string, params?: unknown[]): Promise<MssqlQueryResult>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  end(): Promise<void>;
}

export type MssqlClientFactory = (
  credentials: Record<string, unknown>,
  options: Record<string, unknown>,
) => Promise<MssqlClient>;

let clientFactory: MssqlClientFactory | null = null;

export function setMssqlClientFactory(factory: MssqlClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: MssqlClientFactory = async (credentials, options) => {
  const mssql = await import("mssql");
  const server = String(credentials.server ?? credentials.host ?? "localhost");
  const port = Number(credentials.port ?? 1433);
  const database = String(credentials.database ?? credentials.db ?? "");
  const user = String(credentials.user ?? credentials.username ?? "");
  const password = String(credentials.password ?? "");
  const domain = String(credentials.domain ?? "");
  const encrypt = Boolean(credentials.encrypt ?? credentials.tls ?? false);
  const trustServerCertificate = Boolean(
    credentials.trustServerCertificate ?? credentials.ignoreSslIssues ?? false,
  );
  const connectTimeout = Number(options.connectionTimeout ?? options.connectTimeout ?? 30000);
  const requestTimeout = Number(options.requestTimeout ?? options.timeout ?? 15000);

  const pool = await mssql.connect({
    server,
    port,
    database,
    user,
    password,
    domain: domain || undefined,
    options: {
      encrypt,
      trustServerCertificate,
      connectTimeout,
      requestTimeout,
    },
  });

  return {
    async query(sql, params) {
      const req = pool.request();
      if (params && params.length > 0) {
        params.forEach((p, i) => {
          req.input(`p${i + 1}`, p);
        });
      }
      const result = await req.query(sql);
      return {
        rows: result.recordset as Record<string, unknown>[],
        fields: result.recordset.length > 0
          ? Object.keys(result.recordset[0]).map((name) => ({ name }))
          : undefined,
        rowCount: result.rowsAffected?.[0],
      };
    },
    async begin() {
      const transaction = pool.transaction();
      await transaction.begin();
    },
    async commit() {
      // mssql pool-level queries are auto-committed
    },
    async rollback() {
      // mssql pool-level queries are auto-committed
    },
    async end() {
      await pool.close();
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
  return `[${String(name).replace(/\]/g, "]]")}]`;
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
      parts.push(`${quoteIdent(col)} ${op} @p${params.length + 1}`);
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

function resultToColumnsRows(result: MssqlQueryResult): {
  columns: string[];
  rows: unknown[][];
} {
  const columns =
    result.fields?.map((f) => f.name) ?? (result.rows[0] ? Object.keys(result.rows[0]) : []);
  const rows = result.rows.map((r) => columns.map((c) => r[c]));
  return { columns, rows };
}

function prepareMssqlQuery(
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
    return `@p${ordered.length}`;
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
  client: MssqlClient,
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

export const microsoftSqlExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "executeQuery");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const batching = String(options.queryBatching ?? "single");
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("microsoftSql");
  if (!credentials) {
    throw new Error('Microsoft SQL: credential "microsoftSql" is not configured on this node');
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
      case "delete":
        return [await runDelete(ctx, items, client, options, continueOnFail)];
      default:
        throw new Error(`Microsoft SQL: unknown operation "${operation}"`);
    }
  } finally {
    await client.end().catch(() => {});
  }
};

async function executeQuery(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: MssqlClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const queryReplacementRaw = options.queryReplacement ?? "";
  const outputLargeNumbersAsText = options.outputLargeNumbersAsText !== false;

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    let query = String(resolveValue(ctx.getParam("query", ""), item.json, index) ?? "");
    if (!query) throw new Error("Microsoft SQL: query is required");

    if (outputLargeNumbersAsText) {
      // no transformation at this layer — driver handles it
    }

    const replacements = parseQueryReplacement(queryReplacementRaw, item.json, index);
    const { sql, params } = prepareMssqlQuery(query, replacements);
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
  client: MssqlClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const dataMode = ctx.getParam<string>("dataMode", "autoMapInputData");
  const outputColumns = options.outputColumns;

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
    if (!table) throw new Error("Microsoft SQL: table is required");
    const values = mapInsertValues(ctx, item, dataMode);
    const cols = Object.keys(values);
    if (cols.length === 0) throw new Error("Microsoft SQL: no columns to insert");
    const placeholders = cols.map((_, i) => `@p${i + 1}`).join(", ");
    const sql = `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders})`;
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
    if (!table) throw new Error("Microsoft SQL: table is required");
    const allValues = items.map((item) => mapInsertValues(ctx, item, dataMode));
    const cols = Object.keys(allValues[0] ?? {});
    if (cols.length === 0) throw new Error("Microsoft SQL: no columns to insert");
    const params: unknown[] = [];
    const rowPlaceholders = allValues.map((vals) => {
      const ph = cols.map((c) => {
        params.push(vals[c]);
        return `@p${params.length}`;
      });
      return `(${ph.join(", ")})`;
    });
    const sql = `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
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
  client: MssqlClient,
  options: Record<string, unknown>,
  batching: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const dataMode = ctx.getParam<string>("dataMode", "autoMapInputData");
  const outputColumns = options.outputColumns;

  const runOne = async (item: INodeExecutionData, index: number): Promise<INodeExecutionData[]> => {
    const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
    if (!table) throw new Error("Microsoft SQL: table is required");
    const matchCol = String(ctx.getParam("columnToMatchOn", "") ?? "");
    if (!matchCol) throw new Error("Microsoft SQL: columnToMatchOn is required");
    const values = mapInsertValues(ctx, item, dataMode);
    let matchVal = resolveValue(ctx.getParam("valueToMatchOn", ""), item.json);
    if (matchVal === "" || matchVal == null) {
      matchVal = values[matchCol];
    }
    const setCols = Object.keys(values).filter((c) => c !== matchCol);
    if (setCols.length === 0) throw new Error("Microsoft SQL: no columns to update");
    const params: unknown[] = [];
    const setParts = setCols.map((c) => {
      params.push(values[c]);
      return `${quoteIdent(c)} = @p${params.length}`;
    });
    params.push(matchVal);
    const sql = `UPDATE ${quoteIdent(table)} SET ${setParts.join(", ")} WHERE ${quoteIdent(matchCol)} = @p${params.length}`;
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

async function runDelete(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  client: MssqlClient,
  options: Record<string, unknown>,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const table = locatorValue(ctx.getParam("table", { mode: "list", value: "" }), item.json);
      if (!table) throw new Error("Microsoft SQL: table is required");
      const matchCol = String(ctx.getParam("columnToMatchOn", "") ?? "");
      if (!matchCol) throw new Error("Microsoft SQL: columnToMatchOn is required");
      const matchVal = resolveValue(ctx.getParam("valueToMatchOn", ""), item.json);
      const sql = `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(matchCol)} = @p1`;
      await client.query(sql, [matchVal]);
      out.push({
        json: { success: true },
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

export function rebuildLargeNumbers(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "number" && !Number.isSafeInteger(v)) {
        out[k] = String(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}