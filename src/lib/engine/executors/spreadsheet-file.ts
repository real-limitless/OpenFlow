import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems, withPairedItem } from "@/sdk";

interface SpreadsheetFileOptions {
  headerRow?: boolean;
  delimiter?: string;
  encoding?: string;
  enableBOM?: boolean;
  relaxQuotes?: boolean;
  includeEmptyCells?: boolean;
  maxRowCount?: number;
  range?: string;
  rawData?: boolean;
  readAsString?: boolean;
  sheetName?: string;
  fromLine?: number;
  skipRecordsWithErrors?: { enabled?: boolean; maxSkippedRecords?: number };
  compression?: boolean;
  fileName?: string;
}

type XlsxModule = {
  read: (data: unknown, opts: Record<string, unknown>) => WorkBook;
  utils: {
    sheet_to_json: (sheet: unknown, opts?: Record<string, unknown>) => unknown[];
    json_to_sheet: (data: unknown[], opts?: Record<string, unknown>) => unknown;
    book_new: () => WorkBook;
    book_append_sheet: (book: WorkBook, sheet: unknown, name: string) => void;
  };
  write: (book: WorkBook, opts: Record<string, unknown>) => string;
};
interface WorkBook {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

function decodeBinary(bin: IBinaryData, encoding?: string): string {
  const enc = encoding && encoding !== "utf-8" ? encoding : "utf8";
  return Buffer.from(bin.data, "base64").toString(enc as BufferEncoding);
}

function detectFormatFromBinary(bin: IBinaryData): string {
  const fn = (bin.fileName ?? "").toLowerCase();
  if (fn.endsWith(".csv")) return "csv";
  if (fn.endsWith(".html") || fn.endsWith(".htm")) return "html";
  if (fn.endsWith(".ods")) return "ods";
  if (fn.endsWith(".rtf")) return "rtf";
  if (fn.endsWith(".xls")) return "xls";
  if (fn.endsWith(".xlsx")) return "xlsx";
  return "csv";
}

function parseCsvRows(text: string, delimiter: string, relaxQuotes?: boolean): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        current.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        current.push(field);
        field = "";
        if (current.length > 1 || current[0] !== "") {
          rows.push(current);
        }
        current = [];
      } else {
        field += ch;
      }
    }
  }

  if (field !== "" || current.length > 0) {
    current.push(field);
    if (current.length > 1 || current[0] !== "") {
      rows.push(current);
    }
  }

  return rows;
}

function parseCsv(
  text: string,
  options: SpreadsheetFileOptions,
  itemIndex: number,
): { records: Record<string, unknown>[]; errors: number } {
  const delimiter = options.delimiter || ",";
  const headerRow = options.headerRow !== false;
  const fromLine = options.fromLine ?? 0;
  const maxRowCount = options.maxRowCount ?? -1;
  const skipEnabled = options.skipRecordsWithErrors?.enabled ?? true;
  const maxSkipped = options.skipRecordsWithErrors?.maxSkippedRecords ?? -1;

  let raw = parseCsvRows(text, delimiter, options.relaxQuotes);

  if (options.enableBOM && raw.length > 0 && raw[0].length > 0) {
    raw[0][0] = raw[0][0].replace(/^\uFEFF/, "");
  }

  if (fromLine > 0) {
    raw = raw.slice(fromLine);
  }

  if (maxRowCount > 0) {
    raw = raw.slice(0, headerRow ? maxRowCount + 1 : maxRowCount);
  }

  if (raw.length === 0) return { records: [], errors: 0 };

  let keys: string[];
  let dataRows: string[][];

  if (headerRow) {
    keys = raw[0];
    dataRows = raw.slice(1);
  } else {
    keys = raw[0].map((_, i) => String(i));
    dataRows = raw;
  }

  const records: Record<string, unknown>[] = [];
  let errors = 0;

  for (let ri = 0; ri < dataRows.length; ri++) {
    try {
      if (keys.length !== dataRows[ri].length) {
        throw new Error(`Column count mismatch: expected ${keys.length}, got ${dataRows[ri].length}`);
      }
      const obj: Record<string, unknown> = {};
      for (let ci = 0; ci < keys.length; ci++) {
        const val = dataRows[ri][ci] ?? "";
        obj[keys[ci]] = options.readAsString ? String(val) : val;
      }
      if (!options.includeEmptyCells) {
        for (const k of Object.keys(obj)) {
          if (obj[k] === "") delete obj[k];
        }
      }
      records.push(obj);
    } catch {
      errors++;
      if (skipEnabled && (maxSkipped < 0 || errors <= maxSkipped)) continue;
      throw new Error(`Spreadsheet File: malformed CSV row ${ri}`);
    }
  }

  if (skipEnabled && maxSkipped >= 0 && errors > maxSkipped) {
    throw new Error(`Spreadsheet File: too many skipped records (${errors} > ${maxSkipped})`);
  }

  return { records, errors };
}

function parseHtml(text: string, options: SpreadsheetFileOptions): Record<string, unknown>[] {
  const headerRow = options.headerRow !== false;
  const rowMatches = text.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];

  const rows = rowMatches.map((rowHtml) => {
    const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
    return cellMatches.map((cell) =>
      cell
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim(),
    );
  });

  if (rows.length === 0) return [];

  let keys: string[];
  let dataRows: string[][];

  if (headerRow) {
    keys = rows[0];
    dataRows = rows.slice(1);
  } else {
    keys = rows[0].map((_, i) => String(i));
    dataRows = rows;
  }

  return dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      const val = row[i] ?? "";
      if (options.includeEmptyCells || val !== "") {
        obj[keys[i]] = options.readAsString ? String(val) : val;
      }
    }
    return obj;
  });
}

function parseRtf(text: string, options: SpreadsheetFileOptions): Record<string, unknown>[] {
  const headerRow = options.headerRow !== false;
  const rowMatches = text.match(/\\intbl\s+(.*?)\\row/g) ?? [];

  const rows = rowMatches.map((rowRtf) => {
    const cells = rowRtf.split(/\\cell/);
    return cells
      .map((c) => c.replace(/\\[a-z0-9-]+/gi, "").replace(/[{}]/g, "").trim())
      .filter((c) => c !== "");
  });

  if (rows.length === 0) return [];

  let keys: string[];
  let dataRows: string[][];

  if (headerRow) {
    keys = rows[0];
    dataRows = rows.slice(1);
  } else {
    keys = rows[0].map((_, i) => String(i));
    dataRows = rows;
  }

  return dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      const val = row[i] ?? "";
      if (options.includeEmptyCells || val !== "") {
        obj[keys[i]] = options.readAsString ? String(val) : val;
      }
    }
    return obj;
  });
}

function collectKeys(items: INodeExecutionData[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of items) {
    for (const k of Object.keys(item.json)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  return keys;
}

function csvEscape(value: unknown, delimiter: string): string {
  const s = value == null ? "" : String(value);
  if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(items: INodeExecutionData[], options: SpreadsheetFileOptions): string {
  const delimiter = options.delimiter || ",";
  const headerRow = options.headerRow !== false;
  const keys = collectKeys(items);
  const lines: string[] = [];

  if (headerRow && keys.length > 0) {
    lines.push(keys.map((k) => csvEscape(k, delimiter)).join(delimiter));
  }

  for (const item of items) {
    const row = keys.map((k) => {
      const v = item.json[k];
      if (v == null && !options.includeEmptyCells) return "";
      return csvEscape(v, delimiter);
    });
    lines.push(row.join(delimiter));
  }

  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtml(items: INodeExecutionData[], options: SpreadsheetFileOptions): string {
  const headerRow = options.headerRow !== false;
  const keys = collectKeys(items);
  const parts: string[] = ["<table>"];

  if (headerRow && keys.length > 0) {
    parts.push("<tr>");
    for (const k of keys) parts.push(`<th>${escapeHtml(k)}</th>`);
    parts.push("</tr>");
  }

  for (const item of items) {
    parts.push("<tr>");
    for (const k of keys) {
      const v = item.json[k];
      if (v == null && !options.includeEmptyCells) {
        parts.push("<td></td>");
      } else {
        parts.push(`<td>${escapeHtml(String(v))}</td>`);
      }
    }
    parts.push("</tr>");
  }

  parts.push("</table>");
  return parts.join("\n");
}

function escapeRtf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

function toRtf(items: INodeExecutionData[], options: SpreadsheetFileOptions): string {
  const headerRow = options.headerRow !== false;
  const keys = collectKeys(items);
  const cols = keys.length;
  if (cols === 0) return "{\\rtf1\\ansi}";

  const cellBorder = "\\pard\\intbl";
  const rowEnd = "\\cell\\row\n";
  const parts: string[] = ["{\\rtf1\\ansi"];

  if (headerRow) {
    parts.push(cellBorder);
    for (const k of keys) {
      parts.push(`\\cellx${1000}\\intbl ${escapeRtf(k)}`);
    }
    parts.push(rowEnd);
  }

  for (const item of items) {
    parts.push(cellBorder);
    for (const k of keys) {
      const v = item.json[k];
      const s = v == null ? "" : String(v);
      parts.push(`\\cellx${1000}\\intbl ${escapeRtf(s)}`);
    }
    parts.push(rowEnd);
  }

  parts.push("}");
  return parts.join("");
}

function parseXlsxBase64(
  base64: string,
  options: SpreadsheetFileOptions,
  fileFormat: string,
): Record<string, unknown>[] {
  const headerRow = options.headerRow !== false;
  const sheetName = options.sheetName || "";
  const includeEmpty = options.includeEmptyCells ?? false;
  const readAsString = options.readAsString ?? false;

  // Lazy-load xlsx (CJS → ESM via dynamic import)
  const XLSX = _lazyXlsx();

  const workbook = XLSX.read(base64, { type: "base64" });
  const sheet = sheetName
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error(`Spreadsheet File: sheet "${sheetName || workbook.SheetNames[0]}" not found`);

  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (raw.length === 0) return [];

  let dataRows: unknown[][];
  if (options.range) {
    dataRows = applyRange(raw, options.range, headerRow);
  } else {
    dataRows = raw;
  }

  let keys: string[];
  let rows: unknown[][];

  if (headerRow) {
    keys = (dataRows[0] ?? []).map((v, i) => (v == null ? `column_${i}` : String(v)));
    rows = dataRows.slice(1);
  } else {
    keys = (dataRows[0] ?? []).map((_, i) => String(i));
    rows = dataRows;
  }

  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let ci = 0; ci < keys.length; ci++) {
      const val = row[ci];
      const isEmpty = val === null || val === undefined || val === "";
      if (!includeEmpty && isEmpty) continue;
      obj[keys[ci]] = readAsString ? (isEmpty ? "" : String(val)) : (isEmpty ? "" : val);
    }
    return obj;
  });
}

function applyRange(
  raw: unknown[][],
  range: string,
  _headerRow: boolean,
): unknown[][] {
  const trimmed = range.trim();
  if (/^[A-Za-z]+[0-9]+/.test(trimmed)) {
    const startRow = parseInt(trimmed.replace(/^[A-Za-z]+/, ""), 10);
    if (!isNaN(startRow) && startRow > 0) {
      return raw.slice(startRow - 1);
    }
  }
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num > 0) {
    return raw.slice(num);
  }
  return raw;
}

function toXlsxBase64(
  items: INodeExecutionData[],
  options: SpreadsheetFileOptions,
  fileFormat: string,
): string {
  const XLSX = _lazyXlsx();
  const headerRow = options.headerRow !== false;
  const sheetName = options.sheetName || "Sheet";
  const keys = collectKeys(items);

  const data: Record<string, unknown>[] = items.map((item) => {
    const row: Record<string, unknown> = {};
    for (const k of keys) {
      const v = item.json[k];
      if (v === undefined && !options.includeEmptyCells) continue;
      row[k] = v ?? "";
    }
    return row;
  });

  const sheet = XLSX.utils.json_to_sheet(data, { header: headerRow ? keys : [] });
  const workbook = XLSX.utils.book_new();
  const safeName = sheetName.slice(0, 31);
  XLSX.utils.book_append_sheet(workbook, sheet, safeName);

  const bookType = fileFormat === "xls" ? "xls" : fileFormat === "ods" ? "ods" : "xlsx";
  return XLSX.write(workbook, {
    type: "base64",
    bookType,
    compression: options.compression ?? false,
  });
}

let _xlsxMod: XlsxModule | null = null;
function _lazyXlsx(): XlsxModule {
  if (!_xlsxMod) {
    throw new Error(
      "Spreadsheet File: xlsx library not loaded. Call initXlsx() before using workbook formats.",
    );
  }
  return _xlsxMod;
}

export async function initXlsx(): Promise<void> {
  if (_xlsxMod) return;
  const mod = await import("xlsx");
  _xlsxMod = mod as unknown as XlsxModule;
}
  function makeBinaryFromBase64(
  base64: string,
  fileFormat: string,
  options: SpreadsheetFileOptions,
  binaryPropertyName: string,
): Record<string, IBinaryData> {
  const buf = Buffer.from(base64, "base64");
  const MIME_MAP: Record<string, { mime: string; ext: string }> = {
    ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", ext: "ods" },
    xls: { mime: "application/vnd.ms-excel", ext: "xls" },
    xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  };
  const meta = MIME_MAP[fileFormat] ?? { mime: "application/octet-stream", ext: "bin" };
  const rawName = options.fileName || "spreadsheet";
  const fileName = rawName.endsWith(`.${meta.ext}`) ? rawName : `${rawName}.${meta.ext}`;
  return {
    [binaryPropertyName]: {
      data: base64,
      mimeType: meta.mime,
      fileName,
      fileExtension: meta.ext,
      fileSize: buf.length,
    },
  };
}

function makeBinary(
  content: string | Buffer,
  fileFormat: string,
  options: SpreadsheetFileOptions,
  binaryPropertyName: string,
): Record<string, IBinaryData> {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;

  const MIME_MAP: Record<string, { mime: string; ext: string }> = {
    csv: { mime: "text/csv", ext: "csv" },
    html: { mime: "text/html", ext: "html" },
    ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", ext: "ods" },
    rtf: { mime: "application/rtf", ext: "rtf" },
    xls: { mime: "application/vnd.ms-excel", ext: "xls" },
    xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  };

  const meta = MIME_MAP[fileFormat] ?? { mime: "application/octet-stream", ext: "bin" };
  const rawName = options.fileName || "spreadsheet";
  const fileName = rawName.endsWith(`.${meta.ext}`) ? rawName : `${rawName}.${meta.ext}`;

  return {
    [binaryPropertyName]: {
      data: buf.toString("base64"),
      mimeType: meta.mime,
      fileName,
      fileExtension: meta.ext,
      fileSize: buf.length,
    },
  };
}

export const spreadsheetFileExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "fromFile");
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const fileFormat = ctx.getParam<string>("fileFormat", "autodetect");
  const rawOptions = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const options: SpreadsheetFileOptions = {
    headerRow: rawOptions.headerRow as boolean | undefined,
    delimiter: rawOptions.delimiter as string | undefined,
    encoding: rawOptions.encoding as string | undefined,
    enableBOM: rawOptions.enableBOM as boolean | undefined,
    relaxQuotes: rawOptions.relaxQuotes as boolean | undefined,
    includeEmptyCells: rawOptions.includeEmptyCells as boolean | undefined,
    maxRowCount: rawOptions.maxRowCount as number | undefined,
    range: rawOptions.range as string | undefined,
    rawData: rawOptions.rawData as boolean | undefined,
    readAsString: rawOptions.readAsString as boolean | undefined,
    sheetName: rawOptions.sheetName as string | undefined,
    fromLine: rawOptions.fromLine as number | undefined,
    compression: rawOptions.compression as boolean | undefined,
    fileName: rawOptions.fileName as string | undefined,
  };

  const skipRaw = rawOptions.skipRecordsWithErrors as
    | { value?: { enabled?: boolean; maxSkippedRecords?: number } }
    | undefined;
  if (skipRaw?.value) {
    options.skipRecordsWithErrors = {
      enabled: skipRaw.value.enabled ?? true,
      maxSkippedRecords: skipRaw.value.maxSkippedRecords ?? -1,
    };
  }

  const continueOnFail = ctx.continueOnFail();

  if (operation === "fromFile") {
    const output: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const bin = item.binary?.[binaryPropertyName];

      if (!bin) {
        if (!continueOnFail) {
          throw new Error(
            `Spreadsheet File: binary property "${binaryPropertyName}" is missing on item ${itemIndex}`,
          );
        }
        output.push({
          json: { ...item.json, error: `binary property "${binaryPropertyName}" is missing` },
          pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
        });
        continue;
      }

      try {
        const resolvedFormat = fileFormat === "autodetect" ? detectFormatFromBinary(bin) : fileFormat;
        const text = decodeBinary(bin, options.encoding);

        if (options.rawData) {
          output.push({
            json: { ...item.json, data: text, format: resolvedFormat },
            pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
          });
          continue;
        }

        let records: Record<string, unknown>[];

        switch (resolvedFormat) {
          case "csv": {
            const result = parseCsv(text, options, itemIndex);
            records = result.records;
            break;
          }
          case "html":
            records = parseHtml(text, options);
            break;
          case "rtf":
            records = parseRtf(text, options);
            break;
          case "ods":
          case "xls":
          case "xlsx": {
            await initXlsx();
            records = parseXlsxBase64(bin.data, options, resolvedFormat);
            break;
          }
          default:
            throw new Error(`Spreadsheet File: unsupported file format "${resolvedFormat}"`);
        }

        for (const record of records) {
          output.push({
            json: record,
            pairedItem: { item: itemIndex, input: 0 },
          });
        }
      } catch (err) {
        if (!continueOnFail) throw err;
        output.push({
          json: {
            ...item.json,
            error: err instanceof Error ? err.message : String(err),
          },
          pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
        });
      }
    }

    return [output];
  }

  if (operation === "toFile") {
    if (items.length === 0) return [[{ json: {} }]];

    const fmt = fileFormat || "xls";

    let content: string;

    switch (fmt) {
      case "csv":
        content = toCsv(items, options);
        break;
      case "html":
        content = toHtml(items, options);
        break;
      case "rtf":
        content = toRtf(items, options);
        break;
      case "ods":
      case "xls":
      case "xlsx": {
        await initXlsx();
        content = toXlsxBase64(items, options, fmt);
        const bin = makeBinaryFromBase64(content, fmt, options, binaryPropertyName);
        const output = items.map((item, idx) => ({
          json: { ...item.json },
          binary: { ...item.binary, ...bin },
          pairedItem: item.pairedItem ?? { item: idx, input: 0 },
        }));
        return [output];
      }
      default:
        throw new Error(`Spreadsheet File: unsupported file format "${fmt}"`);
    }

    const bin = makeBinary(content, fmt, options, binaryPropertyName);
    const output = items.map((item, idx) => ({
      json: { ...item.json },
      binary: { ...item.binary, ...bin },
      pairedItem: item.pairedItem ?? { item: idx, input: 0 },
    }));

    return [output];
  }

  throw new Error(`Spreadsheet File: unknown operation "${operation}"`);
};