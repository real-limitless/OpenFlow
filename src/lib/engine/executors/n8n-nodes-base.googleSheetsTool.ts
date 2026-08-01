import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  if (!raw) return "";
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") return extractId(resolved);
  if (resolved && typeof resolved === "object" && "value" in (resolved as Record<string, unknown>)) {
    return extractId(String((resolved as Record<string, unknown>).value ?? ""));
  }
  return extractId(String(resolved ?? ""));
}

function extractId(value: string): string {
  if (!value) return "";
  const urlMatch = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  return value;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function indexToColLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}

function sheetTitle(name: string): string {
  if (!name) return "Sheet1";
  if (/^[A-Za-z_]/.test(name) && !name.includes("!") && !name.includes("'")) return name;
  return `'${name.replace(/'/g, "''")}'`;
}

export const googleSheetsToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "sheet");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(ctx, node, resource, operation, itemJson);
      for (const json of results) {
        out.push({ json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(node.parameters.authentication ?? "oAuth2");
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleSheetsOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleSheetsTool: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleSheetsTool: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
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
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleSheetsTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const token = await getAccessToken(ctx, node);

  if (resource === "document") {
    if (operation === "create") {
      return [await createSpreadsheet(node, itemJson, token)];
    }
    if (operation === "delete" || operation === "deleteSpreadsheet") {
      return [await deleteSpreadsheet(node, itemJson, token)];
    }
    throw new Error(`GoogleSheetsTool: unsupported document operation "${operation}"`);
  }

  if (resource === "sheet") {
    switch (operation) {
      case "getAll":
      case "get":
        return readSheet(node, itemJson, token);
      case "append":
      case "appendOrUpdate":
        return [await appendOrUpdate(node, itemJson, token)];
      case "update":
        return [await updateRow(node, itemJson, token)];
      case "clear":
        return [await clearSheet(node, itemJson, token)];
      case "create":
        return [await createSheet(node, itemJson, token)];
      case "delete":
        return [await deleteSheet(node, itemJson, token)];
      case "deleteRowsOrColumns":
        return [await deleteRowsOrColumns(node, itemJson, token)];
      default:
        throw new Error(`GoogleSheetsTool: unsupported sheet operation "${operation}"`);
    }
  }

  throw new Error(`GoogleSheetsTool: unsupported resource "${resource}"`);
}

function getDocumentId(node: INode, itemJson: Record<string, unknown>): string {
  const raw = node.parameters.documentId;
  const id = resolveLocator(raw, itemJson);
  if (!id) throw new Error("GoogleSheetsTool: documentId is required");
  return id;
}

function getSheetName(node: INode, itemJson: Record<string, unknown>): string {
  const raw = node.parameters.sheetName ?? node.parameters.range;
  if (typeof raw === "string" && raw.includes("!")) {
    return raw.split("!")[0].replace(/^'|'$/g, "");
  }
  const name = resolveLocator(raw, itemJson);
  return name || "Sheet1";
}

async function createSpreadsheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
  const sheetsRaw = node.parameters.sheets as Array<Record<string, unknown>> | undefined;
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;

  const sheets = (sheetsRaw ?? [{ title: "Sheet1" }]).map((s) => ({
    properties: {
      title: String(resolveValue(s.title, itemJson) ?? "Sheet1"),
    },
  }));

  const body: Record<string, unknown> = {
    properties: {
      title: title || "Untitled",
      ...(options.locale ? { locale: String(options.locale) } : {}),
      ...(options.autoRecalc || options.recalculationInterval
        ? { autoRecalc: String(options.autoRecalc ?? options.recalculationInterval) }
        : {}),
    },
    sheets,
  };

  const res = await apiRequest("POST", SHEETS_API, token, body);
  const data = asObj(res.body);
  const props = asObj(data.properties);
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    sheets: data.sheets ?? sheets,
    title: props.title ?? title,
  };
}

async function deleteSpreadsheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  await apiRequest("DELETE", `${DRIVE_API}/${encodeURIComponent(documentId)}`, token);
  return { success: true };
}

async function readSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;

  const range = `${sheetTitle(sheet)}`;
  const qs = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}?${qs}`;
  const res = await apiRequest("GET", url, token);
  const data = asObj(res.body);
  const values = (data.values as unknown[][]) ?? [];

  if (values.length === 0) return [];

  const headers = (values[0] ?? []).map((h, i) => String(h ?? `col_${i}`));
  let rows = values.slice(1).map((row, ri) => {
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] ?? "";
    }
    obj.row_number = ri + 2;
    return obj;
  });

  const filters = node.parameters.filters as Record<string, unknown> | undefined;
  if (filters?.column && filters?.value !== undefined) {
    const col = String(resolveValue(filters.column, itemJson) ?? "");
    const val = String(resolveValue(filters.value, itemJson) ?? "");
    if (col) {
      rows = rows.filter((r) => String(r[col] ?? "") === val);
    }
  }

  return rows;
}

async function appendOrUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const rowData = resolveRowData(node, itemJson);
  const columns = Object.keys(rowData);
  if (columns.length === 0) throw new Error("GoogleSheetsTool: no data to append");

  const useAppend = node.parameters.useAppend !== false;
  if (useAppend) {
    return appendRows(documentId, sheet, token, rowData);
  }
  return updateMatchingRow(documentId, sheet, token, node, itemJson, rowData);
}

async function appendRows(
  documentId: string,
  sheet: string,
  token: string,
  rowData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const values = [Object.values(rowData)];
  const range = `${sheetTitle(sheet)}!A:A`;
  const body = { values, majorDimension: "ROWS" };
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await apiRequest("POST", url, token, body);
  const data = asObj(res.body);
  const updates = asObj(data.updates ?? {});
  return {
    spreadsheetId: documentId,
    updatedRange: String(updates.updatedRange ?? ""),
    updatedRows: Number(updates.updatedRows ?? 1),
    updatedCells: Number(updates.updatedCells ?? values[0].length),
  };
}

async function updateMatchingRow(
  documentId: string,
  sheet: string,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  rowData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const matchingColumns = getMatchingColumns(node);
  const range = `${sheetTitle(sheet)}`;
  const qs = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}?${qs}`;
  const res = await apiRequest("GET", url, token);
  const data = asObj(res.body);
  const values = (data.values as unknown[][]) ?? [];

  if (values.length < 2) throw new Error("GoogleSheetsTool: no data rows found for update");

  const headers = (values[0] ?? []).map((h) => String(h ?? ""));
  const matchColIndices = matchingColumns.length > 0
    ? matchingColumns.map((mc) => headers.indexOf(mc)).filter((i) => i >= 0)
    : [0];

  let targetRow = -1;
  const colKeys = Object.keys(rowData);
  for (let ri = 1; ri < values.length; ri++) {
    const row = values[ri];
    const match = matchColIndices.every((ci) => {
      const key = headers[ci];
      return key && String(row[ci] ?? "") === String(rowData[key] ?? "");
    });
    if (match) {
      targetRow = ri + 1;
      break;
    }
  }

  if (targetRow < 0) throw new Error("GoogleSheetsTool: no matching row found for update");

  const updateRow: unknown[] = [];
  for (let ci = 0; ci < headers.length; ci++) {
    if (colKeys.includes(headers[ci])) {
      updateRow.push(rowData[headers[ci]]);
    } else if (values[targetRow - 1] && ci < values[targetRow - 1].length) {
      updateRow.push(values[targetRow - 1][ci]);
    } else {
      updateRow.push("");
    }
  }

  const updateRange = `${sheetTitle(sheet)}!A${targetRow}:${indexToColLetter(updateRow.length - 1)}${targetRow}`;
  const updateBody = { values: [updateRow], majorDimension: "ROWS" };
  const updateUrl = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;
  const updateRes = await apiRequest("PUT", updateUrl, token, updateBody);
  const updateData = asObj(updateRes.body);
  const updates = asObj(updateData.updates ?? {});
  return {
    spreadsheetId: documentId,
    updatedRange: String(updates.updatedRange ?? updateRange),
    updatedRows: Number(updates.updatedRows ?? 1),
    updatedCells: Number(updates.updatedCells ?? updateRow.length),
  };
}

async function updateRow(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const rowData = resolveRowData(node, itemJson);
  const columns = Object.keys(rowData);
  if (columns.length === 0) throw new Error("GoogleSheetsTool: no data to update");

  return updateMatchingRow(documentId, sheet, token, node, itemJson, rowData);
}

function resolveRowData(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const columnMapping = node.parameters.columnMapping as Record<string, unknown> | undefined;
  const mappingMode = String(columnMapping?.mode ?? "auto");

  if (mappingMode === "auto" || mappingMode === "automatically") {
    return { ...itemJson };
  }

  if (mappingMode === "manual" || mappingMode === "nothing") {
    const values = columnMapping?.values as Array<Record<string, unknown>> | undefined;
    if (values && values.length > 0) {
      const obj: Record<string, unknown> = {};
      for (const v of values) {
        const key = String(v.column ?? v.name ?? "");
        if (!key) continue;
        obj[key] = resolveValue(v.value, itemJson);
      }
      return obj;
    }
  }

  if (mappingMode === "nothing") return {};
  return { ...itemJson };
}

function getMatchingColumns(node: INode): string[] {
  const columnMapping = node.parameters.columnMapping as Record<string, unknown> | undefined;
  if (columnMapping?.matchingColumns && Array.isArray(columnMapping.matchingColumns)) {
    return columnMapping.matchingColumns.map(String);
  }
  const matchRaw = node.parameters.columnToMatchOn;
  if (matchRaw) return [String(matchRaw)];
  return [];
}

async function clearSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const clearScope = String(node.parameters.clearScope ?? "wholeSheet");
  const keepFirstRow = node.parameters.keepFirstRow === true;

  if (clearScope === "wholeSheet") {
    const range = keepFirstRow
      ? `${sheetTitle(sheet)}!2:999999`
      : `${sheetTitle(sheet)}!A:ZZ`;
    const url = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}:clear`;
    const res = await apiRequest("POST", url, token);
    return asObj(res.body);
  }

  if (clearScope === "specificRows" || clearScope === "specificColumns" || clearScope === "specificRange") {
    const range = buildCustomRange(sheet, node, itemJson);
    const url = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}:clear`;
    const res = await apiRequest("POST", url, token);
    return asObj(res.body);
  }

  const range = `${sheetTitle(sheet)}`;
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}:clear`;
  const res = await apiRequest("POST", url, token);
  return asObj(res.body);
}

function buildCustomRange(sheet: string, node: INode, _itemJson: Record<string, unknown>): string {
  const startRow = Number(node.parameters.startRow ?? 1);
  const startColumn = String(node.parameters.startColumn ?? "A");
  const numRows = Number(node.parameters.numRows ?? 1);
  const numColumns = Number(node.parameters.numColumns ?? 1);
  const endCol = indexToColLetter(Math.max(0, colLetterToIndex(startColumn) + numColumns - 1));
  const endRow = startRow + numRows - 1;
  return `${sheetTitle(sheet)}!${startColumn}${startRow}:${endCol}${endRow}`;
}

function colLetterToIndex(letter: string): number {
  let n = 0;
  const s = letter.toUpperCase().replace(/[^A-Z]/g, "");
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return Math.max(0, n - 1);
}

async function createSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const title = String(resolveValue(node.parameters.title, itemJson) ?? "New Sheet");
  const addSheetRequest: Record<string, unknown> = {
    addSheet: {
      properties: { title },
    },
  };

  const hidden = node.parameters.hidden === true;
  const rightToLeft = node.parameters.rightToLeft === true;
  const addSheetProps = (addSheetRequest.addSheet as Record<string, unknown>).properties as Record<string, unknown>;
  if (hidden) addSheetProps.hidden = true;
  if (rightToLeft) addSheetProps.rightToLeft = true;

  const body = { requests: [addSheetRequest] };
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}:batchUpdate`;
  const res = await apiRequest("POST", url, token, body);
  const data = asObj(res.body);
  const replies = (data.replies as Array<Record<string, unknown>>) ?? [];
  const createdSheet = asObj((replies[0]?.addSheet as Record<string, unknown>) ?? {});
  return {
    spreadsheetId: documentId,
    sheetId: createdSheet.sheetId,
    title,
    properties: createdSheet.properties ?? { title },
  };
}

async function deleteSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheetRaw = node.parameters.sheetName ?? node.parameters.sheet;
  const sheetName = resolveLocator(sheetRaw, itemJson);

  if (!sheetName) throw new Error("GoogleSheetsTool: sheet name is required for delete");

  const getUrl = `${SHEETS_API}/${encodeURIComponent(documentId)}?fields=sheets.properties`;
  const getRes = await apiRequest("GET", getUrl, token);
  const getData = asObj(getRes.body);
  const sheets = (getData.sheets as Array<{ properties: Record<string, unknown> }>) ?? [];
  const target = sheets.find(
    (s) => String(s.properties?.title ?? "") === sheetName || String(s.properties?.sheetId ?? "") === sheetName,
  );
  if (!target) throw new Error(`GoogleSheetsTool: sheet "${sheetName}" not found`);

  const body = {
    requests: [{ deleteSheet: { sheetId: target.properties.sheetId } }],
  };
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}:batchUpdate`;
  const res = await apiRequest("POST", url, token, body);
  return asObj(res.body);
}

async function deleteRowsOrColumns(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const dimension = node.parameters.startColumn ? "COLUMNS" : "ROWS";
  const startIndexRaw = Number(node.parameters.startRowNumber ?? node.parameters.startRow ?? node.parameters.startColumnIndex ?? 0);
  const startIndex = Math.max(0, startIndexRaw - 1);
  const numToDelete = Number(node.parameters.numRowsOrColumns ?? 1);

  const getUrl = `${SHEETS_API}/${encodeURIComponent(documentId)}?fields=sheets.properties`;
  const getRes = await apiRequest("GET", getUrl, token);
  const getData = asObj(getRes.body);
  const sheets = (getData.sheets as Array<{ properties: Record<string, unknown> }>) ?? [];
  const target = sheets.find((s) => String(s.properties?.title ?? "") === sheet);
  if (!target) throw new Error(`GoogleSheetsTool: sheet "${sheet}" not found`);

  const body = {
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId: target.properties.sheetId,
            dimension,
            startIndex,
            endIndex: startIndex + numToDelete,
          },
        },
      },
    ],
  };
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}:batchUpdate`;
  const res = await apiRequest("POST", url, token, body);
  return asObj(res.body);
}
