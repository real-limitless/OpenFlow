import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

function workbookUrl(workbookId: string): string {
  return `${GRAPH_API}/me/drive/items/${encodeURIComponent(workbookId)}/workbook`;
}

function worksheetUrl(workbookId: string, worksheetId: string): string {
  return `${workbookUrl(workbookId)}/worksheets/${encodeURIComponent(worksheetId)}`;
}

function tableUrl(workbookId: string, worksheetId: string, tableId: string): string {
  return `${worksheetUrl(workbookId, worksheetId)}/tables/${encodeURIComponent(tableId)}`;
}

function resolveValue(raw: unknown, _itemJson: Record<string, unknown>): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>).value ?? "");
  }
  if (raw && typeof raw === "object" && "mode" in (raw as Record<string, unknown>)) {
    const obj = raw as Record<string, unknown>;
    if (obj.mode === "id" || obj.mode === "name") {
      return String(obj.value ?? "");
    }
  }
  return String(raw ?? "");
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const credNames = ["microsoftExcelOAuth2Api", "microsoftOAuth2Api", "microsoftEntraServicePrincipalApi"];
  let cred = null;
  for (const name of credNames) {
    cred = await ctx.getCredential(name);
    if (cred) break;
  }
  if (!cred) {
    throw new Error("Microsoft Excel Tool: a Microsoft credential is required");
  }
  return {
    Authorization: `Bearer ${String(cred.accessToken ?? "")}`,
    "Content-Type": "application/json",
  };
}

async function apiRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) {
    const detail = (data as Record<string, unknown>)?.error
      ? JSON.stringify((data as Record<string, unknown>).error)
      : res.statusText;
    throw new Error(`Microsoft Excel Tool API error (${res.status}): ${detail}`);
  }
  return data;
}

function rowsToItems(rows: Array<Array<unknown>>, columns: string[]): INodeExecutionData[] {
  return rows.map((row) => {
    const json: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      json[columns[i]] = row[i] ?? null;
    }
    return { json };
  });
}

async function runTableAppend(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const tb = resolveValue(node.parameters.table, {});
  const url = `${tableUrl(wb, ws, tb)}/rows/add`;

  const rows = items.map((item) => {
    const json = item.json ?? {};
    return Object.keys(json).map((k) => json[k]);
  });

  const data = await apiRequest("POST", url, headers, { index: null, values: rows }) as Record<string, unknown>;

  return items.map((item, idx) => ({
    ...item,
    json: { ...item.json, range: data?.range ?? "" },
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runTableGetRows(
  ctx: ExecutionContext,
  node: INode,
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const tb = resolveValue(node.parameters.table, {});
  const data = await apiRequest("GET", `${tableUrl(wb, ws, tb)}/rows`, headers) as Record<string, unknown>;
  const rows = (data.value as Array<Record<string, unknown>>) ?? [];
  return rows.map((row, idx) => ({
    json: row as Record<string, unknown>,
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runTableGetColumns(
  ctx: ExecutionContext,
  node: INode,
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const tb = resolveValue(node.parameters.table, {});
  const data = await apiRequest("GET", `${tableUrl(wb, ws, tb)}/columns`, headers) as Record<string, unknown>;
  const columns = (data.value as Array<Record<string, unknown>>) ?? [];
  return columns.map((col, idx) => ({
    json: col as Record<string, unknown>,
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runTableLookup(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const tb = resolveValue(node.parameters.table, {});
  const columnToMatch = String(node.parameters.columnToMatchOn ?? "");
  const valueToMatch = resolveValue(node.parameters.value, itemJson);

  const data = await apiRequest("GET", `${tableUrl(wb, ws, tb)}/rows`, headers) as Record<string, unknown>;
  const rows = (data.value as Array<Record<string, unknown>>) ?? [];

  for (const row of rows) {
    const rowValues = row.values as Array<Array<unknown>> ?? [];
    const colNames = (row.cellAddress as string ?? "").split(",");
    for (const cells of rowValues) {
      for (let i = 0; i < cells.length; i++) {
        if (String(cells[i]) === String(valueToMatch)) {
          const json: Record<string, unknown> = {};
          for (let j = 0; j < colNames.length && j < cells.length; j++) {
            json[colNames[j]] = cells[j];
          }
          return { json };
        }
      }
    }
  }

  throw new Error(`Microsoft Excel Tool: lookup value "${valueToMatch}" not found in column "${columnToMatch}"`);
}

async function runTableAddTable(
  ctx: ExecutionContext,
  node: INode,
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const address = String(node.parameters.address ?? "");
  const hasHeaders = Boolean(node.parameters.hasHeaders ?? true);
  const url = `${worksheetUrl(wb, ws)}/tables/add`;
  const data = await apiRequest("POST", url, headers, {
    address,
    hasHeaders,
  }) as Record<string, unknown>;
  return [{ json: data as Record<string, unknown> }];
}

async function runTableConvertToRange(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const tb = resolveValue(node.parameters.table, {});
  await apiRequest("POST", `${tableUrl(wb, ws, tb)}/convertToRange`, headers);
  return items.map((item, idx) => ({ ...item, pairedItem: { item: idx, input: 0 } }));
}

async function runTableDelete(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const tb = resolveValue(node.parameters.table, {});
  await apiRequest("DELETE", `${tableUrl(wb, ws, tb)}`, headers);
  return items.map((item, idx) => ({ ...item, pairedItem: { item: idx, input: 0 } }));
}

async function runWorkbookGetAll(
  ctx: ExecutionContext,
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const data = await apiRequest("GET", `${GRAPH_API}/me/drive/root/children`, headers) as Record<string, unknown>;
  const files = (data.value as Array<Record<string, unknown>>) ?? [];
  const excelFiles = files.filter((f) => {
    const name = String(f.name ?? "");
    return name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv");
  });
  return excelFiles.map((f, idx) => ({
    json: { id: f.id, name: f.name, webUrl: f.webUrl } as Record<string, unknown>,
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runWorkbookAddWorksheet(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const name = String(node.parameters.name ?? "NewSheet");
  const data = await apiRequest("POST", `${workbookUrl(wb)}/worksheets/add`, headers, { name }) as Record<string, unknown>;
  return items.map((item, idx) => ({
    ...item,
    json: { ...item.json, ...(data as Record<string, unknown>) },
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runWorkbookDelete(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  await apiRequest("DELETE", `${GRAPH_API}/me/drive/items/${encodeURIComponent(wb)}`, headers);
  return items.map((item, idx) => ({ ...item, pairedItem: { item: idx, input: 0 } }));
}

async function runWorksheetGetAll(
  ctx: ExecutionContext,
  node: INode,
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const data = await apiRequest("GET", `${workbookUrl(wb)}/worksheets`, headers) as Record<string, unknown>;
  const sheets = (data.value as Array<Record<string, unknown>>) ?? [];
  return sheets.map((s, idx) => ({
    json: s as Record<string, unknown>,
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runWorksheetReadRows(
  ctx: ExecutionContext,
  node: INode,
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const rawDataOutput = Boolean(node.parameters.rawDataOutput ?? false);

  const data = await apiRequest("GET", `${worksheetUrl(wb, ws)}/range`, headers) as Record<string, unknown>;
  const rangeData = data as Record<string, unknown>;
  const rows = (rangeData.values as Array<Array<unknown>>) ?? [];

  if (rows.length === 0) return [];

  const columns = (rows[0] ?? []).map((c) => String(c));
  const dataRows = rows.slice(1);
  const items = rowsToItems(dataRows, columns);

  if (rawDataOutput) {
    return items.map((item) => ({
      ...item,
      json: { ...item.json, raw: rangeData },
    }));
  }
  return items;
}

async function runWorksheetAppend(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const url = `${worksheetUrl(wb, ws)}/range`;

  const rows = items.map((item) => {
    const json = item.json ?? {};
    return Object.keys(json).map((k) => json[k]);
  });

  const data = await apiRequest("PATCH", url, headers, { values: rows }) as Record<string, unknown>;
  return items.map((item, idx) => ({
    ...item,
    json: { ...item.json, range: data?.range ?? "" },
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runWorksheetClear(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  await apiRequest("POST", `${worksheetUrl(wb, ws)}/range/clear`, headers);
  return items.map((item, idx) => ({ ...item, pairedItem: { item: idx, input: 0 } }));
}

async function runWorksheetDelete(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  await apiRequest("DELETE", `${worksheetUrl(wb, ws)}`, headers);
  return items.map((item, idx) => ({ ...item, pairedItem: { item: idx, input: 0 } }));
}

async function runWorksheetUpdate(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const url = `${worksheetUrl(wb, ws)}/range`;

  const rows = items.map((item) => {
    const json = item.json ?? {};
    return Object.keys(json).map((k) => json[k]);
  });

  const data = await apiRequest("PATCH", url, headers, { values: rows }) as Record<string, unknown>;
  return items.map((item, idx) => ({
    ...item,
    json: { ...item.json, range: data?.range ?? "" },
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runWorksheetUpsert(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const headers = await authHeaders(ctx);
  const wb = resolveValue(node.parameters.workbook, {});
  const ws = resolveValue(node.parameters.worksheet, {});
  const url = `${worksheetUrl(wb, ws)}/range`;

  const rows = items.map((item) => {
    const json = item.json ?? {};
    return Object.keys(json).map((k) => json[k]);
  });

  const data = await apiRequest("PATCH", url, headers, { values: rows }) as Record<string, unknown>;
  return items.map((item, idx) => ({
    ...item,
    json: { ...item.json, range: data?.range ?? "" },
    pairedItem: { item: idx, input: 0 },
  }));
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  items: INodeExecutionData[],
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  switch (resource) {
    case "table":
      switch (operation) {
        case "append":
          return runTableAppend(ctx, node, items);
        case "getRows":
          return runTableGetRows(ctx, node);
        case "getColumns":
          return runTableGetColumns(ctx, node);
        case "lookup": {
          const result = await runTableLookup(ctx, node, itemJson);
          return [result];
        }
        case "addTable":
          return runTableAddTable(ctx, node);
        case "convertToRange":
          return runTableConvertToRange(ctx, node, items);
        case "deleteTable":
          return runTableDelete(ctx, node, items);
        default:
          throw new Error(`Microsoft Excel Tool: unknown table operation "${operation}"`);
      }

    case "workbook":
      switch (operation) {
        case "getAll":
          return runWorkbookGetAll(ctx);
        case "addWorksheet":
          return runWorkbookAddWorksheet(ctx, node, items);
        case "deleteWorkbook":
          return runWorkbookDelete(ctx, node, items);
        default:
          throw new Error(`Microsoft Excel Tool: unknown workbook operation "${operation}"`);
      }

    case "worksheet":
      switch (operation) {
        case "getAll":
          return runWorksheetGetAll(ctx, node);
        case "readRows":
          return runWorksheetReadRows(ctx, node);
        case "append":
          return runWorksheetAppend(ctx, node, items);
        case "clear":
          return runWorksheetClear(ctx, node, items);
        case "deleteWorksheet":
          return runWorksheetDelete(ctx, node, items);
        case "update":
          return runWorksheetUpdate(ctx, node, items);
        case "upsert":
          return runWorksheetUpsert(ctx, node, items);
        default:
          throw new Error(`Microsoft Excel Tool: unknown worksheet operation "${operation}"`);
      }

    default:
      throw new Error(`Microsoft Excel Tool: unknown resource "${resource}"`);
  }
}

const BATCH_OPS = new Set([
  "append", "addTable", "convertToRange", "deleteTable",
  "addWorksheet", "deleteWorkbook", "clear", "deleteWorksheet", "update", "upsert",
]);

export const microsoftExcelToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "table");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();
  const isBatch = BATCH_OPS.has(operation);

  const iterations = isBatch ? (items.length > 0 ? [items[0]] : []) : items;

  for (let idx = 0; idx < iterations.length; idx++) {
    const item = iterations[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(ctx, node, resource, operation, items, itemJson);
      for (const r of results) {
        out.push({ ...r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
