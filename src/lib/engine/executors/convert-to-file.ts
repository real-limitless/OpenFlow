import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";

interface ConvertOptions {
  fileName?: string;
  headerRow?: boolean;
  delimiter?: string;
  includeEmptyCells?: boolean;
  rawData?: boolean;
  fieldName?: string;
  mimeType?: string;
  fileExtension?: string;
  multipleFiles?: boolean;
  eventTitle?: string;
  eventDescription?: string;
  eventLocation?: string;
  eventStart?: string;
  eventEnd?: string;
}

const MIME_MAP: Record<string, { mime: string; ext: string }> = {
  csv: { mime: "text/csv", ext: "csv" },
  html: { mime: "text/html", ext: "html" },
  iCal: { mime: "text/calendar", ext: "ics" },
  toJson: { mime: "application/json", ext: "json" },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", ext: "ods" },
  rtf: { mime: "application/rtf", ext: "rtf" },
  toText: { mime: "text/plain", ext: "txt" },
  xls: { mime: "application/vnd.ms-excel", ext: "xls" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  toBinary: { mime: "application/octet-stream", ext: "bin" },
};

function makeBinary(
  content: string | Buffer,
  operation: string,
  options: ConvertOptions,
  binaryPropertyName: string,
  itemIndex: number,
): Record<string, IBinaryData> {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const meta = MIME_MAP[operation] ?? { mime: "application/octet-stream", ext: "bin" };
  const mimeType = options.mimeType || meta.mime;
  const fileExtension = options.fileExtension || meta.ext;
  const baseName = options.fileName || `file_${itemIndex}`;
  const fileName = `${baseName}.${fileExtension}`;

  return {
    [binaryPropertyName]: {
      data: buf.toString("base64"),
      mimeType,
      fileName,
      fileExtension,
      fileSize: buf.length,
    },
  };
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

function toCsv(items: INodeExecutionData[], options: ConvertOptions): string {
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

function toHtml(items: INodeExecutionData[], options: ConvertOptions): string {
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toRtf(items: INodeExecutionData[], options: ConvertOptions): string {
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

function escapeRtf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

function toJsonSingle(items: INodeExecutionData[]): string {
  const arr = items.map((item) => item.json);
  return JSON.stringify(arr, null, 2);
}

function toJsonPerItem(item: INodeExecutionData): string {
  return JSON.stringify(item.json, null, 2);
}

function toIcsEvent(item: INodeExecutionData, options: ConvertOptions, index: number): string {
  const json = item.json;
  const title = resolveFieldOrLiteral(options.eventTitle || "title", json, "Event");
  const desc = resolveFieldOrLiteral(options.eventDescription || "description", json, "");
  const location = resolveFieldOrLiteral(options.eventLocation || "location", json, "");
  const start = resolveFieldOrLiteral(options.eventStart || "start", json, "");
  const end = resolveFieldOrLiteral(options.eventEnd || "end", json, "");

  const dtStart = formatIcsDate(start);
  const dtEnd = formatIcsDate(end);
  const uid = `${Date.now()}-${index}@openflow`;
  const dtStamp = formatIcsDate(new Date().toISOString());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenFlow//ConvertToFile//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
  ];
  if (dtStart) lines.push(`DTSTART:${dtStart}`);
  if (dtEnd) lines.push(`DTEND:${dtEnd}`);
  lines.push(`SUMMARY:${escapeIcs(title)}`);
  if (desc) lines.push(`DESCRIPTION:${escapeIcs(desc)}`);
  if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}

function resolveFieldOrLiteral(
  spec: string,
  json: Record<string, unknown>,
  fallback: string,
): string {
  if (!spec) return fallback;
  if (spec in json) return String(json[spec] ?? fallback);
  return spec;
}

function formatIcsDate(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export const convertToFileExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "csv");
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const opts: ConvertOptions = {
    fileName: options.fileName as string | undefined,
    headerRow: options.headerRow as boolean | undefined,
    delimiter: options.delimiter as string | undefined,
    includeEmptyCells: options.includeEmptyCells as boolean | undefined,
    rawData: options.rawData as boolean | undefined,
    fieldName: (options.fieldName as string | undefined) ?? "data",
    mimeType: options.mimeType as string | undefined,
    fileExtension: options.fileExtension as string | undefined,
    multipleFiles: options.multipleFiles as boolean | undefined,
    eventTitle: options.eventTitle as string | undefined,
    eventDescription: options.eventDescription as string | undefined,
    eventLocation: options.eventLocation as string | undefined,
    eventStart: options.eventStart as string | undefined,
    eventEnd: options.eventEnd as string | undefined,
  };

  if (!binaryPropertyName) {
    throw new Error("Convert to File: binaryPropertyName is required");
  }

  const continueOnFail = ctx.continueOnFail();

  function makeOutput(
    content: string | Buffer,
    itemIndex: number,
    sourceItem?: INodeExecutionData,
  ): INodeExecutionData {
    const base = sourceItem ?? items[itemIndex] ?? { json: {} };
    return {
      json: { ...base.json },
      binary: makeBinary(content, operation, opts, binaryPropertyName, itemIndex),
      pairedItem: base.pairedItem ?? { item: itemIndex, input: 0 },
    };
  }

  switch (operation) {
    case "csv":
      return [[makeOutput(toCsv(items, opts), 0)]];

    case "html":
      return [[makeOutput(toHtml(items, opts), 0)]];

    case "rtf":
      return [[makeOutput(toRtf(items, opts), 0)]];

    case "toJson": {
      if (opts.multipleFiles) {
        return [
          items.map((item, idx) => makeOutput(toJsonPerItem(item), idx, item)),
        ];
      }
      return [[makeOutput(toJsonSingle(items), 0)]];
    }

    case "toText": {
      const fieldName = opts.fieldName ?? "data";
      return [
        items.map((item, idx) => {
          const val = item.json[fieldName];
          if (val == null) {
            if (!continueOnFail) {
              throw new Error(`Convert to File: field "${fieldName}" is missing on item ${idx}`);
            }
            return {
              json: { ...item.json, error: `field "${fieldName}" is missing` },
              binary: item.binary,
              pairedItem: item.pairedItem ?? { item: idx, input: 0 },
            };
          }
          return makeOutput(String(val), idx, item);
        }),
      ];
    }

    case "toBinary": {
      const fieldName = opts.fieldName ?? "data";
      return [
        items.map((item, idx) => {
          const val = item.json[fieldName];
          if (val == null || typeof val !== "string") {
            if (!continueOnFail) {
              throw new Error(
                `Convert to File: field "${fieldName}" is missing or not a string on item ${idx}`,
              );
            }
            return {
              json: { ...item.json, error: `field "${fieldName}" is missing or not a string` },
              binary: item.binary,
              pairedItem: item.pairedItem ?? { item: idx, input: 0 },
            };
          }
          const buf = Buffer.from(val, "base64");
          return makeOutput(buf, idx, item);
        }),
      ];
    }

    case "iCal": {
      return [
        items.map((item, idx) => makeOutput(toIcsEvent(item, opts, idx), idx, item)),
      ];
    }

    case "ods":
    case "xls":
    case "xlsx":
      throw new Error(
        `Convert to File: operation "${operation}" is not yet implemented (requires spreadsheet library). TODO.`,
      );

    default:
      throw new Error(`Convert to File: unknown operation "${operation}"`);
  }
};