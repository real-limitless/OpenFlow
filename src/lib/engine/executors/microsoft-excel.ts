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

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): string {
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
  const credNames = ["microsoftExcelOAuth2Api", "microsoftOAuth2Api", "microsoftEntraOAuth2Api"];
  let cred = null;
  for (const name of credNames) {
    cred = await ctx.getCredential(name);
    if (cred) break;
  }
  if (!cred) {
    throw new Error("Microsoft Excel: a Microsoft credential is required");
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
): Promise<{ status: number; body: unknown }> {
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const err = errObj.error as Record<string, unknown> | undefined;
    const msg = err?.message ?? errObj.message ?? `HTTP ${res.status}`;
    throw new Error(`Microsoft Excel: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function getValue(obj: Record<string, unknown>, key: string): unknown {
  if (obj[key] !== undefined) return obj[key];
  if (obj.values !== undefined) {
    const arr = obj.values as unknown[];
    if (arr.length > 0 && Array.isArray(arr[0])) {
      const row = arr[0] as unknown[];
      const idx = ((obj._keys as string[]) ?? []).indexOf(key);
      if (idx >= 0) return row[idx];
    }
  }
  return undefined;
}

export const microsoftExcelExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = (node.parameters.resource as string) ?? "table";
  const operation = (node.parameters.operation as string) ?? "getRows";
  const continueOnFail = ctx.continueOnFail();

  const headers = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(ctx, node, resource, operation, itemJson, headers);
      if (results === undefined) {
        out.push({ json: { ...itemJson }, pairedItem });
      } else if (Array.isArray(results)) {
        for (const r of results) {
          out.push({ json: r as Record<string, unknown>, pairedItem: { item: idx, input: 0 } });
        }
      } else {
        out.push({ json: results as Record<string, unknown>, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | Record<string, unknown>[] | undefined> {
  switch (resource) {
    case "table":
      return runTableOperation(ctx, node, operation, itemJson, headers);
    case "workbook":
      return runWorkbookOperation(ctx, node, operation, itemJson, headers);
    case "worksheet":
      return runWorksheetOperation(ctx, node, operation, itemJson, headers);
    default:
      throw new Error(`Microsoft Excel: unsupported resource "${resource}"`);
  }
}

function getWorkbookId(node: INode, itemJson: Record<string, unknown>): string {
  return resolveValue(node.parameters.workbook, itemJson);
}

function getWorksheetId(node: INode, itemJson: Record<string, unknown>): string {
  return resolveValue(node.parameters.worksheet, itemJson);
}

function getTableId(node: INode, itemJson: Record<string, unknown>): string {
  return resolveValue(node.parameters.table, itemJson);
}

async function runTableOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const wbId = getWorkbookId(node, itemJson);
  const wsId = getWorksheetId(node, itemJson);
  const tId = getTableId(node, itemJson);

  switch (operation) {
    case "getRows": {
      if (!tId) throw new Error("Microsoft Excel: table is required");
      const url = `${tableUrl(wbId, wsId, tId)}/rows`;
      const res = await apiRequest("GET", url, headers);
      const data = asObj(res.body);
      const rows = (data.value as Array<Record<string, unknown>>) ?? [];
      const rawOutput = node.parameters.rawDataOutput === true;
      if (rawOutput) {
        return rows.map((r) => ({ json: r, raw: data }));
      }
      const columns = await getTableColumnNames(wbId, wsId, tId, headers);
      return rows.map((r) => {
        const values = (r.values as unknown[][]) ?? [];
        const obj: Record<string, unknown> = {};
        if (values.length > 0) {
          for (let c = 0; c < columns.length; c++) {
            obj[columns[c]] = values[0][c] ?? "";
          }
        }
        obj._index = r.index;
        return obj;
      });
    }
    case "getColumns": {
      if (!tId) throw new Error("Microsoft Excel: table is required");
      const names = await getTableColumnNames(wbId, wsId, tId, headers);
      return names.map((name, i) => ({ column: name, index: i }));
    }
    case "append": {
      if (!tId) throw new Error("Microsoft Excel: table is required");
      const columns = await getTableColumnNames(wbId, wsId, tId, headers);
      const rowValues = columns.map((c) => itemJson[c] ?? "");
      const url = `${tableUrl(wbId, wsId, tId)}/rows`;
      const res = await apiRequest("POST", url, headers, { values: [rowValues] });
      const data = asObj(res.body);
      return { ...itemJson, range: data.range ?? "" };
    }
    case "lookup": {
      if (!tId) throw new Error("Microsoft Excel: table is required");
      const matchCol = String(node.parameters.columnToMatchOn ?? "");
      const matchVal = String(node.parameters.valueToMatch ?? "");
      if (!matchCol) throw new Error("Microsoft Excel: columnToMatchOn is required for lookup");
      const columns = await getTableColumnNames(wbId, wsId, tId, headers);
      const url = `${tableUrl(wbId, wsId, tId)}/rows`;
      const res = await apiRequest("GET", url, headers);
      const data = asObj(res.body);
      const rows = (data.value as Array<Record<string, unknown>>) ?? [];
      const rawOutput = node.parameters.rawDataOutput === true;
      for (const r of rows) {
        const values = (r.values as unknown[][]) ?? [];
        if (values.length === 0) continue;
        const colIdx = columns.indexOf(matchCol);
        if (colIdx >= 0) {
          const cellVal = String(values[0][colIdx] ?? "");
          if (cellVal === matchVal) {
            const obj: Record<string, unknown> = {};
            for (let c = 0; c < columns.length; c++) {
              obj[columns[c]] = values[0][c] ?? "";
            }
            if (rawOutput) obj.raw = data;
            return obj;
          }
        }
      }
      throw new Error(`Microsoft Excel: no row found with ${matchCol} = ${matchVal}`);
    }
    case "addTable": {
      const range = String(node.parameters.range ?? "");
      if (!range) throw new Error("Microsoft Excel: range is required for addTable");
      const hasHeaders = node.parameters.hasHeaders !== false;
      const url = `${worksheetUrl(wbId, wsId)}/tables`;
      const body: Record<string, unknown> = {
        address: range,
        hasHeaders,
      };
      const res = await apiRequest("POST", url, headers, body);
      const data = asObj(res.body);
      return {
        id: data.id,
        name: data.name,
        address: data.address,
      };
    }
    case "convertToRange": {
      if (!tId) throw new Error("Microsoft Excel: table is required");
      const url = `${tableUrl(wbId, wsId, tId)}/convertToRange`;
      const res = await apiRequest("POST", url, headers, {});
      const data = asObj(res.body);
      return { address: data.address, success: true };
    }
    case "deleteTable": {
      if (!tId) throw new Error("Microsoft Excel: table is required");
      await apiRequest("DELETE", tableUrl(wbId, wsId, tId), headers);
      return undefined;
    }
    default:
      throw new Error(`Microsoft Excel: unsupported table operation "${operation}"`);
  }
}

async function getTableColumnNames(
  wbId: string,
  wsId: string,
  tId: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const url = `${tableUrl(wbId, wsId, tId)}/columns`;
  const res = await apiRequest("GET", url, headers);
  const data = asObj(res.body);
  const cols = (data.value as Array<Record<string, unknown>>) ?? [];
  return cols.map((c) => String(c.name ?? ""));
}

async function runWorkbookOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const wbId = getWorkbookId(node, itemJson);

  switch (operation) {
    case "getAll": {
      const url = `${GRAPH_API}/me/drive/root/search(q='.xlsx')`;
      const res = await apiRequest("GET", url, headers);
      const data = asObj(res.body);
      const items = (data.value as Array<Record<string, unknown>>) ?? [];
      return items.map((f) => ({
        id: f.id,
        name: f.name,
        webUrl: f.webUrl,
        createdDateTime: f.createdDateTime,
        lastModifiedDateTime: f.lastModifiedDateTime,
        size: f.size,
      }));
    }
    case "addWorksheet": {
      const name = String(node.parameters.worksheet ?? "Sheet1");
      if (!name) throw new Error("Microsoft Excel: worksheet name is required");
      const url = `${workbookUrl(wbId)}/worksheets`;
      const res = await apiRequest("POST", url, headers, { name });
      const data = asObj(res.body);
      return {
        id: data.id,
        name: data.name,
        position: data.position,
      };
    }
    case "deleteWorkbook": {
      if (!wbId) throw new Error("Microsoft Excel: workbook is required");
      const url = `${GRAPH_API}/me/drive/items/${encodeURIComponent(wbId)}`;
      await apiRequest("DELETE", url, headers);
      return undefined;
    }
    default:
      throw new Error(`Microsoft Excel: unsupported workbook operation "${operation}"`);
  }
}

async function runWorksheetOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const wbId = getWorkbookId(node, itemJson);
  const wsId = getWorksheetId(node, itemJson);

  switch (operation) {
    case "getAll": {
      const url = `${workbookUrl(wbId)}/worksheets`;
      const res = await apiRequest("GET", url, headers);
      const data = asObj(res.body);
      const sheets = (data.value as Array<Record<string, unknown>>) ?? [];
      return sheets.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        visibility: s.visibility,
      }));
    }
    case "readRows": {
      if (!wsId) throw new Error("Microsoft Excel: worksheet is required");
      const range = String(node.parameters.range ?? "");
      const rangeUrl = range
        ? `${worksheetUrl(wbId, wsId)}/range(address='${encodeURIComponent(range)}')`
        : `${worksheetUrl(wbId, wsId)}/usedRange`;
      const res = await apiRequest("GET", rangeUrl, headers);
      const data = asObj(res.body);
      const values = (data.values as unknown[][]) ?? [];
      const rawOutput = node.parameters.rawDataOutput === true;
      if (rawOutput) {
        return [{ json: { raw: data } }];
      }
      if (values.length === 0) return [];
      const dataStartRow = Number(node.parameters.dataStartRow ?? 1);
      const headerRow = Math.max(0, dataStartRow - 1);
      const headers_ = values[headerRow]?.map((h) => String(h ?? `col_${h}`)) ?? [];
      const rows = values.slice(headerRow + 1).map((row) => {
        const obj: Record<string, unknown> = {};
        for (let c = 0; c < headers_.length; c++) {
          obj[headers_[c]] = row[c] ?? "";
        }
        return obj;
      });
      return rows;
    }
    case "append": {
      if (!wsId) throw new Error("Microsoft Excel: worksheet is required");
      const range = String(node.parameters.range ?? "");
      const rangeUrl = `${worksheetUrl(wbId, wsId)}/range(address='${encodeURIComponent(range || "A1")}')`;
      const existing = await apiRequest("GET", rangeUrl, headers);
      const existingData = asObj(existing.body);
      const existingValues = (existingData.values as unknown[][]) ?? [];
      const dataStartRow = Number(node.parameters.dataStartRow ?? 1);
      const headerRow = Math.max(0, dataStartRow - 1);
      const headers_ = existingValues[headerRow]?.map((h) => String(h ?? "")) ?? [];
      const rowValues = headers_.map((c) => itemJson[c] ?? "");
      const nextRow = existingValues.length + 1;
      const appendRange = `A${nextRow}:${String.fromCharCode(64 + Math.max(headers_.length, 1))}${nextRow}`;
      const appendUrl = `${worksheetUrl(wbId, wsId)}/range(address='${encodeURIComponent(appendRange)}')`;
      const res = await apiRequest("PATCH", appendUrl, headers, { values: [rowValues] });
      const resultData = asObj(res.body);
      return { ...itemJson, range: resultData.address ?? appendRange };
    }
    case "clear": {
      if (!wsId) throw new Error("Microsoft Excel: worksheet is required");
      const range = String(node.parameters.range ?? "");
      const clearUrl = range
        ? `${worksheetUrl(wbId, wsId)}/range(address='${encodeURIComponent(range)}')/clear`
        : `${worksheetUrl(wbId, wsId)}/usedRange/clear`;
      const applyTo = String(node.parameters.applyTo ?? "All");
      const body: Record<string, unknown> = {};
      if (applyTo !== "All") {
        body.applyTo = applyTo;
      }
      await apiRequest("POST", clearUrl, headers, body);
      return undefined;
    }
    case "deleteWorksheet": {
      if (!wsId) throw new Error("Microsoft Excel: worksheet is required");
      await apiRequest("DELETE", worksheetUrl(wbId, wsId), headers);
      return undefined;
    }
    case "update": {
      if (!wsId) throw new Error("Microsoft Excel: worksheet is required");
      const matchCol = String(node.parameters.columnToMatchOn ?? "");
      const matchVal = String(node.parameters.valueToMatch ?? "");
      if (!matchCol) throw new Error("Microsoft Excel: columnToMatchOn is required for update");
      const rangeUrl = `${worksheetUrl(wbId, wsId)}/usedRange`;
      const res = await apiRequest("GET", rangeUrl, headers);
      const data = asObj(res.body);
      const values = (data.values as unknown[][]) ?? [];
      if (values.length === 0) throw new Error("Microsoft Excel: worksheet is empty");
      const headerRow = 0;
      const headers_ = values[headerRow]?.map((h) => String(h ?? "")) ?? [];
      const colIdx = headers_.indexOf(matchCol);
      if (colIdx < 0) throw new Error(`Microsoft Excel: column "${matchCol}" not found`);
      const rowData: Record<string, unknown> = {};
      const dataMapping = node.parameters.dataMapping as Record<string, unknown> | undefined;
      if (dataMapping && typeof dataMapping === "object") {
        for (const [k, v] of Object.entries(dataMapping)) {
          rowData[k] = v;
        }
      } else {
        for (const key of Object.keys(itemJson)) {
          if (headers_.includes(key)) {
            rowData[key] = itemJson[key];
          }
        }
      }
      for (let r = 1; r < values.length; r++) {
        const row = values[r] ?? [];
        const cellVal = String(row[colIdx] ?? "");
        if (cellVal === matchVal) {
          const updateRow = r + 1;
          const updateValues = headers_.map((h) => (h in rowData ? rowData[h] : (row[h] ?? "")));
          const endCol = String.fromCharCode(64 + Math.max(headers_.length, 1));
          const updateRange = `A${updateRow}:${endCol}${updateRow}`;
          const updateUrl = `${worksheetUrl(wbId, wsId)}/range(address='${encodeURIComponent(updateRange)}')`;
          await apiRequest("PATCH", updateUrl, headers, { values: [updateValues] });
          const resultObj: Record<string, unknown> = { ...itemJson };
          for (let c = 0; c < headers_.length; c++) {
            resultObj[headers_[c]] = updateValues[c];
          }
          return resultObj;
        }
      }
      throw new Error(`Microsoft Excel: no row found with ${matchCol} = ${matchVal}`);
    }
    case "upsert": {
      if (!wsId) throw new Error("Microsoft Excel: worksheet is required");
      const matchColU = String(node.parameters.columnToMatchOn ?? "");
      const matchValU = String(node.parameters.valueToMatch ?? "");
      if (!matchColU) throw new Error("Microsoft Excel: columnToMatchOn is required for upsert");
      const rangeUrlU = `${worksheetUrl(wbId, wsId)}/usedRange`;
      const resU = await apiRequest("GET", rangeUrlU, headers);
      const dataU = asObj(resU.body);
      const valuesU = (dataU.values as unknown[][]) ?? [];
      const headersU = valuesU.length > 0 ? (valuesU[0]?.map((h) => String(h ?? "")) ?? []) : [];
      const colIdxU = headersU.indexOf(matchColU);
      if (colIdxU < 0) throw new Error(`Microsoft Excel: column "${matchColU}" not found`);
      const rowDataU: Record<string, unknown> = {};
      for (const key of Object.keys(itemJson)) {
        if (headersU.includes(key)) {
          rowDataU[key] = itemJson[key];
        }
      }
      for (let r = 1; r < valuesU.length; r++) {
        const row = valuesU[r] ?? [];
        const cellVal = String(row[colIdxU] ?? "");
        if (cellVal === matchValU) {
          const updateRow = r + 1;
          const updateValues = headersU.map((h) => (h in rowDataU ? rowDataU[h] : (row[h] ?? "")));
          const endCol = String.fromCharCode(64 + Math.max(headersU.length, 1));
          const updateRange = `A${updateRow}:${endCol}${updateRow}`;
          const updateUrl = `${worksheetUrl(wbId, wsId)}/range(address='${encodeURIComponent(updateRange)}')`;
          await apiRequest("PATCH", updateUrl, headers, { values: [updateValues] });
          const resultObj: Record<string, unknown> = { ...itemJson };
          for (let c = 0; c < headersU.length; c++) {
            resultObj[headersU[c]] = updateValues[c];
          }
          return resultObj;
        }
      }
      const insertRow = valuesU.length + 1;
      const insertValues = headersU.map((h) => rowDataU[h] ?? "");
      const endCol = String.fromCharCode(64 + Math.max(headersU.length, 1));
      const insertRange = `A${insertRow}:${endCol}${insertRow}`;
      const insertUrl = `${worksheetUrl(wbId, wsId)}/range(address='${encodeURIComponent(insertRange)}')`;
      await apiRequest("PATCH", insertUrl, headers, { values: [insertValues] });
      const resultObj: Record<string, unknown> = { ...itemJson };
      for (let c = 0; c < headersU.length; c++) {
        resultObj[headersU[c]] = insertValues[c];
      }
      return resultObj;
    }
    default:
      throw new Error(`Microsoft Excel: unsupported worksheet operation "${operation}"`);
  }
}
