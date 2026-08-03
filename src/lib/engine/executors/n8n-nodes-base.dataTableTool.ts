import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { resolveLocatorValue } from "@/lib/data-tables/access";

interface TableMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  columns: Array<{ name: string; type: string }>;
}

interface Condition {
  keyName: string;
  condition: string;
  keyValue: string;
}

const inMemoryTables = new Map<string, TableMeta>();
const inMemoryRows = new Map<string, Array<Record<string, unknown>>>();

let tableCounter = 0;
let rowCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}_${++tableCounter}_${Date.now()}`;
}

function nextTableId(): string {
  return generateId("tbl");
}

function nextRowId(): string {
  return `row_${++rowCounter}_${Date.now()}`;
}

function matchesCondition(row: Record<string, unknown>, cond: Condition): boolean {
  const value = row[cond.keyName];
  switch (cond.condition) {
    case "eq":
      return value === cond.keyValue || String(value) === String(cond.keyValue);
    case "neq":
      return value !== cond.keyValue && String(value) !== String(cond.keyValue);
    case "gt":
      return Number(value) > Number(cond.keyValue);
    case "gte":
      return Number(value) >= Number(cond.keyValue);
    case "lt":
      return Number(value) < Number(cond.keyValue);
    case "lte":
      return Number(value) <= Number(cond.keyValue);
    case "isEmpty":
      return value == null || value === "";
    case "isNotEmpty":
      return value != null && value !== "";
    default:
      return false;
  }
}

function matchesConditions(
  row: Record<string, unknown>,
  conditions: Condition[],
  matchType: string,
): boolean {
  if (conditions.length === 0) return true;
  if (matchType === "allConditions") {
    return conditions.every((c) => matchesCondition(row, c));
  }
  return conditions.some((c) => matchesCondition(row, c));
}

export const dataTableToolExecutor: NodeExecutor = async (ctx) => {
  const resource = ctx.getParam<string>("resource", "table");
  const operation = ctx.getParam<string>("operation", "");

  if (resource === "table") {
    return handleTableOperation(ctx, operation);
  }
  if (resource === "row") {
    return handleRowOperation(ctx, operation);
  }

  throw new Error(`Unknown resource: ${resource}`);
};

async function handleTableOperation(
  ctx: Parameters<NodeExecutor>[0],
  operation: string,
): Promise<INodeExecutionData[][]> {
  switch (operation) {
    case "create":
      return handleTableCreate(ctx);
    case "delete":
      return handleTableDelete(ctx);
    case "getMany":
      return handleTableGetMany(ctx);
    case "update":
      return handleTableUpdate(ctx);
    default:
      throw new Error(`Unknown table operation: ${operation}`);
  }
}

async function handleTableCreate(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  const name = ctx.getParam<string>("name", "");
  if (!name) throw new Error("Table name is required");

  const reuseExisting = ctx.getParam<boolean>("reuseExisting", false);
  if (reuseExisting) {
    for (const tbl of inMemoryTables.values()) {
      if (tbl.name === name) {
        return [[{ json: tbl }]];
      }
    }
  }

  const rawColumns = ctx.getParam("columns", {});
  const columnValues =
    (rawColumns as { columnValues?: Array<{ name: string; type: string }> })?.columnValues ?? [];
  const columns = columnValues.map((c) => ({ name: c.name, type: c.type }));

  const now = new Date().toISOString();
  const table: TableMeta = {
    id: nextTableId(),
    name,
    createdAt: now,
    updatedAt: now,
    columns,
  };
  inMemoryTables.set(table.id, table);
  inMemoryRows.set(table.id, []);

  return [[{ json: table }]];
}

async function handleTableDelete(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  const tableRef = resolveLocatorValue(ctx.getParam<unknown>("dataTableId", { mode: "list", value: "" }));
  if (!tableRef) throw new Error("Data table is required");

  const table = inMemoryTables.get(tableRef);
  if (!table) throw new Error(`Table not found: ${tableRef}`);

  inMemoryTables.delete(tableRef);
  inMemoryRows.delete(tableRef);

  return [[{ json: table }]];
}

async function handleTableGetMany(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const returnAll = options.returnAll === true;
  const limit = typeof options.limit === "number" ? options.limit : 50;
  const filterByName = typeof options.filterByName === "string" ? options.filterByName : "";
  const sortField = typeof options.sortField === "string" ? options.sortField : "";
  const sortDirection = options.sortDirection === "DESC" ? "DESC" : "ASC";

  let tables = Array.from(inMemoryTables.values());

  if (filterByName) {
    const lower = filterByName.toLowerCase();
    tables = tables.filter((t) => t.name.toLowerCase().includes(lower));
  }

  if (sortField) {
    tables.sort((a, b) => {
      const av = String((a as Record<string, string>)[sortField] ?? "");
      const bv = String((b as Record<string, string>)[sortField] ?? "");
      return sortDirection === "ASC" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  if (!returnAll && tables.length > limit) {
    tables = tables.slice(0, limit);
  }

  const items: INodeExecutionData[] = tables.map((t) => ({ json: t }));
  return [items.length > 0 ? items : [{ json: {} }]];
}

async function handleTableUpdate(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  const tableRef = resolveLocatorValue(ctx.getParam<unknown>("dataTableId", { mode: "list", value: "" }));
  if (!tableRef) throw new Error("Data table is required");

  const table = inMemoryTables.get(tableRef);
  if (!table) throw new Error(`Table not found: ${tableRef}`);

  const newName = ctx.getParam<string>("newName", "");
  if (!newName) throw new Error("New name is required for update");

  table.name = newName;
  table.updatedAt = new Date().toISOString();

  return [[{ json: table }]];
}

async function handleRowOperation(
  ctx: Parameters<NodeExecutor>[0],
  operation: string,
): Promise<INodeExecutionData[][]> {
  switch (operation) {
    case "delete":
      return handleRowDelete(ctx);
    case "get":
      return handleRowGet(ctx);
    case "insert":
      return handleRowInsert(ctx);
    case "rowExists":
      return handleRowExists(ctx, true);
    case "rowNotExists":
      return handleRowExists(ctx, false);
    case "update":
      return handleRowUpdate(ctx);
    case "upsert":
      return handleRowUpsert(ctx);
    default:
      throw new Error(`Unknown row operation: ${operation}`);
  }
}

async function handleRowInsert(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  const tableRef = resolveLocatorValue(ctx.getParam<unknown>("dataTableId", { mode: "list", value: "" }));
  if (!tableRef) throw new Error("Data table is required");

  const rows = inMemoryRows.get(tableRef);
  if (!rows) throw new Error(`Table not found: ${tableRef}`);

  const inputItems = ctx.getInputItems(0);
  const mappingMode = ctx.getParam<string>("mappingMode", "defineBelow");

  let rowData: Record<string, unknown>[];
  if (mappingMode === "autoMap") {
    rowData = inputItems.map((item) => ({ ...item.json }));
  } else {
    const rawColumns = ctx.getParam("columns", "{}");
    const parsed =
      typeof rawColumns === "string"
        ? JSON.parse(rawColumns || "{}")
        : (rawColumns as Record<string, unknown>);
    rowData = [parsed];
  }

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const optimizeBulk = options.optimizeBulk === true;

  const inserted: Array<Record<string, unknown>> = [];
  for (const data of rowData) {
    const row: Record<string, unknown> = {
      _rowId: nextRowId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    rows.push(row);
    if (!optimizeBulk) {
      inserted.push(row);
    }
  }

  if (optimizeBulk) {
    return [[{ json: { inserted: rowData.length } }]];
  }
  return [inserted.map((r) => ({ json: r }))];
}

async function handleRowGet(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  const tableRef = resolveLocatorValue(ctx.getParam<unknown>("dataTableId", { mode: "list", value: "" }));
  if (!tableRef) throw new Error("Data table is required");

  const rows = inMemoryRows.get(tableRef);
  if (!rows) throw new Error(`Table not found: ${tableRef}`);

  const conditions = extractConditions(ctx);
  const matchType = ctx.getParam<string>("matchType", "anyCondition");

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const returnAll = options.returnAll === true;
  const limit = typeof options.limit === "number" ? options.limit : 50;
  const orderBy = options.orderBy === true;
  const orderByColumn = typeof options.orderByColumn === "string" ? options.orderByColumn : "createdAt";
  const orderByDirection =
    options.orderByDirection === "ASC" ? "ASC" : ("DESC" as string);

  let filtered = conditions.length > 0
    ? rows.filter((r) => matchesConditions(r, conditions, matchType))
    : [...rows];

  if (orderBy) {
    filtered.sort((a, b) => {
      const av = String(a[orderByColumn] ?? "");
      const bv = String(b[orderByColumn] ?? "");
      return orderByDirection === "ASC" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  if (!returnAll && filtered.length > limit) {
    filtered = filtered.slice(0, limit);
  }

  const items = filtered.map((r) => ({ json: { ...r } }));
  return [items.length > 0 ? items : [{ json: {} }]];
}

async function handleRowUpdate(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  return handleRowUpdateOrUpsert(ctx, false);
}

async function handleRowUpsert(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  return handleRowUpdateOrUpsert(ctx, true);
}

async function handleRowUpdateOrUpsert(
  ctx: Parameters<NodeExecutor>[0],
  upsert: boolean,
): Promise<INodeExecutionData[][]> {
  const tableRef = resolveLocatorValue(ctx.getParam<unknown>("dataTableId", { mode: "list", value: "" }));
  if (!tableRef) throw new Error("Data table is required");

  const rows = inMemoryRows.get(tableRef);
  if (!rows) throw new Error(`Table not found: ${tableRef}`);

  const conditions = extractConditions(ctx);
  const matchType = ctx.getParam<string>("matchType", "anyCondition");
  const mappingMode = ctx.getParam<string>("mappingMode", "defineBelow");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const dryRun = options.dryRun === true;

  let updateData: Record<string, unknown>;
  if (mappingMode === "autoMap") {
    const inputItems = ctx.getInputItems(0);
    updateData = inputItems.length > 0 ? { ...inputItems[0].json } : {};
  } else {
    const rawColumns = ctx.getParam("columns", "{}");
    updateData =
      typeof rawColumns === "string"
        ? JSON.parse(rawColumns || "{}")
        : { ...(rawColumns as Record<string, unknown>) };
  }

  const matchingRows = rows.filter((r) => matchesConditions(r, conditions, matchType));
  const now = new Date().toISOString();

  if (dryRun) {
    const preview = matchingRows.map((r) => ({
      _rowId: r._rowId,
      ...r,
      ...updateData,
      updatedAt: now,
    }));
    return [preview.map((r) => ({ json: r }))];
  }

  if (upsert && matchingRows.length === 0) {
    const newRow: Record<string, unknown> = {
      _rowId: nextRowId(),
      createdAt: now,
      updatedAt: now,
      ...updateData,
    };
    rows.push(newRow);
    return [[{ json: newRow }]];
  }

  for (const row of matchingRows) {
    Object.assign(row, updateData);
    row.updatedAt = now;
  }

  return [matchingRows.map((r) => ({ json: { ...r } }))];
}

async function handleRowDelete(
  ctx: Parameters<NodeExecutor>[0],
): Promise<INodeExecutionData[][]> {
  const tableRef = resolveLocatorValue(ctx.getParam<unknown>("dataTableId", { mode: "list", value: "" }));
  if (!tableRef) throw new Error("Data table is required");

  const rows = inMemoryRows.get(tableRef);
  if (!rows) throw new Error(`Table not found: ${tableRef}`);

  const conditions = extractConditions(ctx);
  const matchType = ctx.getParam<string>("matchType", "anyCondition");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const dryRun = options.dryRun === true;

  const matching = rows.filter((r) => matchesConditions(r, conditions, matchType));

  if (dryRun) {
    return [matching.map((r) => ({ json: { ...r } }))];
  }

  const toRemove = new Set(matching);
  const remaining = rows.filter((r) => !toRemove.has(r));
  inMemoryRows.set(tableRef, remaining);

  return [matching.map((r) => ({ json: { ...r, _rowId: r._rowId } }))];
}

async function handleRowExists(
  ctx: Parameters<NodeExecutor>[0],
  expectExists: boolean,
): Promise<INodeExecutionData[][]> {
  const tableRef = resolveLocatorValue(ctx.getParam<unknown>("dataTableId", { mode: "list", value: "" }));
  if (!tableRef) throw new Error("Data table is required");

  const rows = inMemoryRows.get(tableRef);
  if (!rows) throw new Error(`Table not found: ${tableRef}`);

  const conditions = extractConditions(ctx);
  const matchType = ctx.getParam<string>("matchType", "anyCondition");
  const exists = rows.some((r) => matchesConditions(r, conditions, matchType));

  const inputItems = ctx.getInputItems(0);
  const passes = expectExists ? exists : !exists;

  if (!passes) {
    return [[]];
  }

  return [inputItems.length > 0 ? inputItems : [{ json: {} }]];
}

function extractConditions(ctx: Parameters<NodeExecutor>[0]): Condition[] {
  const raw = ctx.getParam("conditions", {});
  const conditionValues =
    (raw as { conditionValues?: Condition[] })?.conditionValues ?? [];
  return conditionValues;
}
