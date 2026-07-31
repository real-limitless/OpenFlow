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
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") return extractId(resolved);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
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

function colLetterToIndex(letter: string): number {
  let n = 0;
  const s = letter.toUpperCase().replace(/[^A-Z]/g, "");
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return Math.max(0, n - 1);
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

export const googleSheetsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "sheet") ?? "sheet");
  const operation = String(
    node.parameters.operation ?? ctx.getParam("operation", resource === "spreadsheet" ? "create" : "read") ?? "read",
  );
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
  const authentication = String(node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2");
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleSheetsOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleSheets: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleSheets: ${credName} has no accessToken`);
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
    throw new Error(`GoogleSheets: ${msg}`);
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

  if (resource === "spreadsheet") {
    if (operation === "create") {
      return [await createSpreadsheet(node, itemJson, token)];
    }
    if (operation === "deleteSpreadsheet" || operation === "delete") {
      return [await deleteSpreadsheet(node, itemJson, token)];
    }
    throw new Error(`GoogleSheets: unsupported spreadsheet operation "${operation}"`);
  }

  if (resource === "sheet") {
    switch (operation) {
      case "read":
        return readSheet(node, itemJson, token);
      case "append":
        return [await appendSheet(node, itemJson, token)];
      case "update":
        return [await updateSheet(node, itemJson, token)];
      case "appendOrUpdate":
        return [await appendOrUpdateSheet(node, itemJson, token)];
      case "clear":
        return [await clearSheet(node, itemJson, token)];
      case "create":
        return [await createSheet(node, itemJson, token)];
      case "delete":
        return [await deleteRowsOrColumns(node, itemJson, token)];
      case "remove":
        return [await removeSheet(node, itemJson, token)];
      default:
        throw new Error(`GoogleSheets: unsupported sheet operation "${operation}"`);
    }
  }

  throw new Error(`GoogleSheets: unsupported resource "${resource}"`);
}

async function createSpreadsheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
  const sheetsUi = (node.parameters.sheetsUi ?? {}) as {
    sheetValues?: Array<Record<string, unknown>>;
  };
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;

  const sheetEntries = sheetsUi.sheetValues ?? [];
  const sheets =
    sheetEntries.length > 0
      ? sheetEntries.map((s) => {
          const props = (s.propertiesUi ?? s) as Record<string, unknown>;
          const sheetTitleVal = String(resolveValue(props.title ?? s.title, itemJson) ?? "Sheet1");
          const hidden = props.hidden === true || s.hidden === true;
          return {
            properties: {
              title: sheetTitleVal,
              ...(hidden ? { hidden: true } : {}),
            },
          };
        })
      : [{ properties: { title: "Sheet1" } }];

  const body: Record<string, unknown> = {
    properties: {
      title: title || "Untitled",
      ...(options.locale ? { locale: String(options.locale) } : {}),
      ...(options.autoRecalc ? { autoRecalc: String(options.autoRecalc) } : {}),
    },
    sheets,
  };

  const res = await apiRequest("POST", SHEETS_API, token, body);
  const data = asObj(res.body);
  const props = asObj(data.properties);
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    title: props.title ?? title,
    sheets: data.sheets ?? sheets,
  };
}

async function deleteSpreadsheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = resolveLocator(node.parameters.documentId, itemJson);
  if (!documentId) throw new Error("GoogleSheets: documentId is required");
  await apiRequest("DELETE", `${DRIVE_API}/${encodeURIComponent(documentId)}`, token);
  return { success: true };
}

function getDocumentId(node: INode, itemJson: Record<string, unknown>): string {
  const id = resolveLocator(node.parameters.documentId ?? node.parameters.sheetId, itemJson);
  if (!id) throw new Error("GoogleSheets: documentId is required");
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

function getOptions(node: INode): Record<string, unknown> {
  return (node.parameters.options ?? {}) as Record<string, unknown>;
}

function getLocation(options: Record<string, unknown>): { headerRow: number; firstDataRow: number } {
  const loc = (options.locationDefine ?? {}) as { values?: Record<string, unknown> };
  const values = loc.values ?? {};
  const headerRow = Number(values.headerRow ?? 1);
  const firstDataRow = Number(values.firstDataRow ?? headerRow + 1);
  return { headerRow, firstDataRow };
}

async function fetchValues(
  documentId: string,
  range: string,
  token: string,
  options: Record<string, unknown>,
): Promise<unknown[][]> {
  const fmt = (options.outputFormatting ?? {}) as { values?: Record<string, unknown> };
  const fmtValues = fmt.values ?? {};
  const valueRenderOption = String(fmtValues.general ?? "UNFORMATTED_VALUE");
  const dateTimeRenderOption = String(fmtValues.date ?? "FORMATTED_STRING");
  const qs = new URLSearchParams({
    valueRenderOption,
    dateTimeRenderOption,
  });
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}?${qs}`;
  const res = await apiRequest("GET", url, token);
  const data = asObj(res.body);
  return (data.values as unknown[][]) ?? [];
}

async function readSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const options = getOptions(node);

  let range = `${sheetTitle(sheet)}`;
  const dataLoc = (options.dataLocationOnSheet ?? {}) as { values?: Record<string, unknown> };
  const locValues = dataLoc.values ?? {};
  const rangeDefinition = String(locValues.rangeDefinition ?? "detectAutomatically");
  if (rangeDefinition === "specifyRangeA1" && locValues.range) {
    range = String(locValues.range);
  } else if (typeof node.parameters.range === "string" && node.parameters.range) {
    range = String(node.parameters.range);
  }

  const values = await fetchValues(documentId, range, token, options);
  if (values.length === 0) return [];

  const headers = (values[0] ?? []).map((h, i) => String(h ?? `col_${i}`));
  let rows = values.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] ?? "";
    }
    return obj;
  });

  const filtersUI = (node.parameters.filtersUI ?? {}) as {
    values?: Array<{ lookupColumn?: string; lookupValue?: unknown }>;
  };
  const filters = filtersUI.values ?? [];
  if (filters.length > 0) {
    const combine = String(node.parameters.combineFilters ?? "AND");
    rows = rows.filter((row) => {
      const checks = filters.map((f) => {
        const col = String(resolveValue(f.lookupColumn, itemJson) ?? "");
        const expected = resolveValue(f.lookupValue, itemJson);
        return String(row[col] ?? "") === String(expected ?? "");
      });
      return combine === "OR" ? checks.some(Boolean) : checks.every(Boolean);
    });
  }

  const returnFirstMatch =
    options.returnFirstMatch === true ||
    options.returnAllMatches === "returnFirstMatch" ||
    String(options.returnAllMatches ?? "") === "returnFirstMatch";

  if (returnFirstMatch && rows.length > 1) {
    rows = rows.slice(0, 1);
  }

  return rows;
}

function resolveRowData(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const columns = (node.parameters.columns ?? {}) as {
    mappingMode?: string;
    value?: unknown;
    matchingColumns?: string[];
  };
  const dataMode = String(
    node.parameters.dataMode ?? columns.mappingMode ?? "autoMapInputData",
  );

  if (dataMode === "autoMapInputData" || columns.mappingMode === "autoMapInputData") {
    return { ...itemJson };
  }

  if (dataMode === "nothing") return {};

  // defineBelow — use fieldsUi or columns.value object, else input json
  const fieldsUi = (node.parameters.fieldsUi ?? {}) as {
    values?: Array<{ fieldId?: string; fieldValue?: unknown; column?: string; value?: unknown }>;
  };
  if (fieldsUi.values && fieldsUi.values.length > 0) {
    const obj: Record<string, unknown> = {};
    for (const f of fieldsUi.values) {
      const key = String(f.fieldId ?? f.column ?? "");
      if (!key) continue;
      obj[key] = resolveValue(f.fieldValue ?? f.value, itemJson);
    }
    return obj;
  }

  if (columns.value && typeof columns.value === "object" && !Array.isArray(columns.value)) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(columns.value as Record<string, unknown>)) {
      obj[k] = resolveValue(v, itemJson);
    }
    // merge input for matching keys not listed
    return { ...itemJson, ...obj };
  }

  return { ...itemJson };
}

function getMatchingColumns(node: INode): string[] {
  const columns = (node.parameters.columns ?? {}) as {
    matchingColumns?: string[];
    value?: Array<{ matchingColumns?: string[] }> | Record<string, unknown>;
  };
  if (Array.isArray(columns.matchingColumns) && columns.matchingColumns.length) {
    return columns.matchingColumns.map(String);
  }
  if (Array.isArray(columns.value)) {
    for (const entry of columns.value) {
      if (entry && typeof entry === "object" && Array.isArray(entry.matchingColumns)) {
        return entry.matchingColumns.map(String);
      }
    }
  }
  const v3 = node.parameters.columnToMatchOn;
  if (v3) return [String(v3)];
  return [];
}

async function ensureHeaders(
  documentId: string,
  sheet: string,
  token: string,
  options: Record<string, unknown>,
  rowData: Record<string, unknown>,
): Promise<string[]> {
  const { headerRow } = getLocation(options);
  const range = `${sheetTitle(sheet)}!${headerRow}:${headerRow}`;
  const values = await fetchValues(documentId, range, token, options);
  let headers = (values[0] ?? []).map((h) => String(h ?? ""));
  const keys = Object.keys(rowData);
  const missing = keys.filter((k) => k && !headers.includes(k));
  const handling = String(options.handlingExtraData ?? "insertInNewColumn");

  if (missing.length > 0) {
    if (handling === "error") {
      throw new Error(`GoogleSheets: unexpected columns: ${missing.join(", ")}`);
    }
    if (handling === "insertInNewColumn") {
      headers = [...headers.filter(Boolean), ...missing];
      const headerRange = `${sheetTitle(sheet)}!A${headerRow}`;
      await apiRequest(
        "PUT",
        `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`,
        token,
        { values: [headers] },
      );
    }
    // ignoreIt: keep headers as-is
  }

  if (headers.length === 0) {
    headers = keys;
    const headerRange = `${sheetTitle(sheet)}!A${headerRow}`;
    await apiRequest(
      "PUT",
      `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`,
      token,
      { values: [headers] },
    );
  }

  return headers.filter(Boolean);
}

function rowToValues(headers: string[], rowData: Record<string, unknown>): unknown[] {
  return headers.map((h) => (h in rowData ? rowData[h] : ""));
}

async function appendSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const options = getOptions(node);
  const cellFormat = String(options.cellFormat ?? "USER_ENTERED");
  const rowData = resolveRowData(node, itemJson);
  const headers = await ensureHeaders(documentId, sheet, token, options, rowData);
  const values = [rowToValues(headers, rowData)];
  const range = `${sheetTitle(sheet)}`;
  const useAppend = options.useAppend === true;
  const url = useAppend
    ? `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}:append?valueInputOption=${cellFormat}&insertDataOption=INSERT_ROWS`
    : `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}:append?valueInputOption=${cellFormat}&insertDataOption=INSERT_ROWS`;

  const res = await apiRequest("POST", url, token, { values });
  const data = asObj(res.body);
  const updates = asObj(data.updates ?? data);
  return {
    updatedRange: updates.updatedRange ?? `${sheet}!A2:${indexToColLetter(headers.length - 1)}2`,
    updatedRows: Number(updates.updatedRows ?? 1),
    updatedColumns: Number(updates.updatedColumns ?? headers.length),
    updatedCells: Number(updates.updatedCells ?? headers.length),
  };
}

async function findMatchingRow(
  documentId: string,
  sheet: string,
  token: string,
  options: Record<string, unknown>,
  matchCols: string[],
  rowData: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  node: INode,
): Promise<{ rowNumber: number; headers: string[] } | null> {
  const { headerRow, firstDataRow } = getLocation(options);
  const range = `${sheetTitle(sheet)}`;
  const values = await fetchValues(documentId, range, token, options);
  if (values.length === 0) return null;
  const headers = (values[0] ?? []).map((h) => String(h ?? ""));
  const matchValues: Record<string, unknown> = {};
  for (const col of matchCols) {
    if (node.parameters.valueToMatchOn !== undefined && matchCols.length === 1) {
      matchValues[col] = resolveValue(node.parameters.valueToMatchOn, itemJson);
    } else {
      matchValues[col] = rowData[col];
    }
  }

  for (let r = firstDataRow - headerRow; r < values.length; r++) {
    const row = values[r] ?? [];
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c] ?? "";
    const ok = matchCols.every((col) => String(obj[col] ?? "") === String(matchValues[col] ?? ""));
    if (ok) {
      return { rowNumber: headerRow + r, headers };
    }
  }
  return null;
}

async function updateSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const options = getOptions(node);
  const cellFormat = String(options.cellFormat ?? "USER_ENTERED");
  const rowData = resolveRowData(node, itemJson);
  const matchCols = getMatchingColumns(node);
  if (matchCols.length === 0) {
    throw new Error("GoogleSheets: matching column required for update");
  }

  const found = await findMatchingRow(documentId, sheet, token, options, matchCols, rowData, itemJson, node);
  if (!found) {
    throw new Error("GoogleSheets: no matching row found for update");
  }

  let headers = found.headers;
  headers = await ensureHeaders(documentId, sheet, token, options, rowData);
  const values = [rowToValues(headers, rowData)];
  const endCol = indexToColLetter(headers.length - 1);
  const range = `${sheetTitle(sheet)}!A${found.rowNumber}:${endCol}${found.rowNumber}`;
  const res = await apiRequest(
    "PUT",
    `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}?valueInputOption=${cellFormat}`,
    token,
    { values },
  );
  const data = asObj(res.body);
  return {
    updatedRange: data.updatedRange ?? range,
    updatedRows: Number(data.updatedRows ?? 1),
    updatedColumns: Number(data.updatedColumns ?? headers.length),
    updatedCells: Number(data.updatedCells ?? headers.length),
  };
}

async function appendOrUpdateSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const options = getOptions(node);
  const rowData = resolveRowData(node, itemJson);
  const matchCols = getMatchingColumns(node);
  if (matchCols.length === 0) {
    return appendSheet(node, itemJson, token);
  }
  const found = await findMatchingRow(documentId, sheet, token, options, matchCols, rowData, itemJson, node);
  if (found) {
    return updateSheet(node, itemJson, token);
  }
  return appendSheet(node, itemJson, token);
}

async function clearSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const clearType = String(node.parameters.clear ?? "wholeSheet");
  let range = `${sheetTitle(sheet)}`;

  if (clearType === "wholeSheet") {
    if (node.parameters.keepFirstRow === true) {
      range = `${sheetTitle(sheet)}!A2:ZZ`;
    }
  } else if (clearType === "specificRows") {
    const start = Number(node.parameters.startIndex ?? 1);
    const count = Number(node.parameters.rowsToDelete ?? 1);
    range = `${sheetTitle(sheet)}!${start}:${start + count - 1}`;
  } else if (clearType === "specificColumns") {
    const startLetter = String(node.parameters.startIndex ?? "A");
    const count = Number(node.parameters.columnsToDelete ?? 1);
    const startIdx = colLetterToIndex(startLetter);
    const endLetter = indexToColLetter(startIdx + count - 1);
    range = `${sheetTitle(sheet)}!${startLetter}:${endLetter}`;
  } else if (clearType === "specificRange") {
    const r = String(node.parameters.range ?? "A:F");
    range = r.includes("!") ? r : `${sheetTitle(sheet)}!${r}`;
  }

  const res = await apiRequest(
    "POST",
    `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}:clear`,
    token,
    {},
  );
  const data = asObj(res.body);
  return {
    success: true,
    clearedRange: data.clearedRange ?? range,
  };
}

async function createSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const title = String(resolveValue(node.parameters.title, itemJson) ?? "n8n-sheet");
  const options = getOptions(node);
  const properties: Record<string, unknown> = { title };
  if (options.hidden === true) properties.hidden = true;
  if (options.rightToLeft === true) properties.rightToLeft = true;
  if (options.sheetId !== undefined && options.sheetId !== "") {
    properties.sheetId = Number(options.sheetId);
  }
  if (options.index !== undefined && options.index !== "") {
    properties.index = Number(options.index);
  }
  if (options.tabColor) {
    const hex = String(options.tabColor).replace(/^#/, "");
    if (hex.length >= 6) {
      properties.tabColor = {
        red: parseInt(hex.slice(0, 2), 16) / 255,
        green: parseInt(hex.slice(2, 4), 16) / 255,
        blue: parseInt(hex.slice(4, 6), 16) / 255,
      };
    }
  }

  const res = await apiRequest("POST", `${SHEETS_API}/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    requests: [{ addSheet: { properties } }],
  });
  const data = asObj(res.body);
  const replies = (data.replies as Array<Record<string, unknown>>) ?? [];
  const added = asObj(asObj(replies[0]).addSheet);
  const props = asObj(added.properties);
  return {
    sheetId: props.sheetId ?? 0,
    title: props.title ?? title,
    index: props.index ?? options.index ?? 0,
  };
}

async function deleteRowsOrColumns(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const sheet = getSheetName(node, itemJson);
  const toDelete = String(node.parameters.toDelete ?? "rows");
  const numberToDelete = Number(node.parameters.numberToDelete ?? 1);

  // Resolve sheetId via spreadsheet metadata
  const meta = await apiRequest("GET", `${SHEETS_API}/${encodeURIComponent(documentId)}?fields=sheets.properties`, token);
  const sheets = (asObj(meta.body).sheets as Array<Record<string, unknown>>) ?? [];
  let sheetId = 0;
  for (const s of sheets) {
    const p = asObj(s.properties);
    if (String(p.title) === sheet || String(p.sheetId) === sheet) {
      sheetId = Number(p.sheetId ?? 0);
      break;
    }
  }

  if (toDelete === "columns") {
    const startLetter = String(node.parameters.startIndex ?? "A");
    const startIndex = colLetterToIndex(startLetter);
    await apiRequest("POST", `${SHEETS_API}/${encodeURIComponent(documentId)}:batchUpdate`, token, {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex,
              endIndex: startIndex + numberToDelete,
            },
          },
        },
      ],
    });
    return { success: true, deletedColumns: numberToDelete, startColumn: startLetter };
  }

  // rows — startIndex is 1-based in UI
  const startRow1 = Number(node.parameters.startIndex ?? 2);
  const startIndex = startRow1 - 1;
  await apiRequest("POST", `${SHEETS_API}/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex,
            endIndex: startIndex + numberToDelete,
          },
        },
      },
    ],
  });
  return { success: true, deletedRows: numberToDelete, startRow: startRow1 };
}

async function removeSheet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = getDocumentId(node, itemJson);
  const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
  if (id === "") throw new Error("GoogleSheets: sheet id is required for remove");
  await apiRequest("POST", `${SHEETS_API}/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    requests: [{ deleteSheet: { sheetId: Number(id) } }],
  });
  return { success: true, deletedSheetId: id };
}
