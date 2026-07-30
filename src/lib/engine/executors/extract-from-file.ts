import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";

interface ExtractOptions {
  headerRow?: boolean;
  delimiter?: string;
  fieldName?: string;
}

function decodeBinary(bin: IBinaryData): string {
  return Buffer.from(bin.data, "base64").toString("utf8");
}

function parseCsv(text: string, options: ExtractOptions): Record<string, unknown>[] {
  const delimiter = options.delimiter || ",";
  const headerRow = options.headerRow !== false;
  const rows = parseCsvRows(text, delimiter);

  if (rows.length === 0) return [];

  let keys: string[];
  let dataRows: string[][];

  if (headerRow) {
    keys = rows[0];
    dataRows = rows.slice(1);
  } else {
    keys = rows[0].map((_, i) => `column_${i}`);
    dataRows = rows;
  }

  return dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      obj[keys[i]] = row[i] ?? "";
    }
    return obj;
  });
}

function parseCsvRows(text: string, delimiter: string): string[][] {
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

function parseHtml(text: string, options: ExtractOptions): Record<string, unknown>[] {
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
    keys = rows[0].map((_, i) => `column_${i}`);
    dataRows = rows;
  }

  return dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      obj[keys[i]] = row[i] ?? "";
    }
    return obj;
  });
}

function parseIcs(text: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  const eventBlocks = text.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi) ?? [];

  for (const block of eventBlocks) {
    const event: Record<string, unknown> = {};
    const lines = block.split(/\r?\n/);

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.substring(0, colonIdx).toUpperCase();
      const value = line.substring(colonIdx + 1).trim();

      switch (key) {
        case "SUMMARY":
          event.title = unescapeIcs(value);
          break;
        case "DESCRIPTION":
          event.description = unescapeIcs(value);
          break;
        case "LOCATION":
          event.location = unescapeIcs(value);
          break;
        case "DTSTART":
          event.start = value;
          break;
        case "DTEND":
          event.end = value;
          break;
        case "UID":
          event.uid = value;
          break;
      }
    }

    events.push(event);
  }

  return events;
}

function unescapeIcs(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseJson(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text.trim());
  if (Array.isArray(parsed)) {
    return parsed.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : { data: item },
    );
  }
  if (parsed && typeof parsed === "object") {
    return [parsed as Record<string, unknown>];
  }
  return [{ data: parsed }];
}

function parseRtf(text: string, options: ExtractOptions): Record<string, unknown>[] {
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
    keys = rows[0].map((_, i) => `column_${i}`);
    dataRows = rows;
  }

  return dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      obj[keys[i]] = row[i] ?? "";
    }
    return obj;
  });
}

export const extractFromFileExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));
  const operation = ctx.getParam<string>("operation", "csv");
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const opts: ExtractOptions = {
    headerRow: options.headerRow as boolean | undefined,
    delimiter: options.delimiter as string | undefined,
    fieldName: (options.fieldName as string | undefined) ?? "data",
  };

  if (!binaryPropertyName) {
    throw new Error("Extract from File: binaryPropertyName is required");
  }

  const continueOnFail = ctx.continueOnFail();
  const output: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const bin = item.binary?.[binaryPropertyName];

    if (!bin) {
      if (!continueOnFail) {
        throw new Error(
          `Extract from File: binary property "${binaryPropertyName}" is missing on item ${itemIndex}`,
        );
      }
      output.push({
        json: { ...item.json, error: `binary property "${binaryPropertyName}" is missing` },
        pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
      });
      continue;
    }

    try {
      const text = decodeBinary(bin);

      switch (operation) {
        case "csv": {
          const records = parseCsv(text, opts);
          for (const record of records) {
            output.push({
              json: record,
              pairedItem: { item: itemIndex, input: 0 },
            });
          }
          break;
        }

        case "html": {
          const records = parseHtml(text, opts);
          for (const record of records) {
            output.push({
              json: record,
              pairedItem: { item: itemIndex, input: 0 },
            });
          }
          break;
        }

        case "iCal": {
          const records = parseIcs(text);
          for (const record of records) {
            output.push({
              json: record,
              pairedItem: { item: itemIndex, input: 0 },
            });
          }
          break;
        }

        case "toJson": {
          const records = parseJson(text);
          for (const record of records) {
            output.push({
              json: record,
              pairedItem: { item: itemIndex, input: 0 },
            });
          }
          break;
        }

        case "rtf": {
          const records = parseRtf(text, opts);
          for (const record of records) {
            output.push({
              json: record,
              pairedItem: { item: itemIndex, input: 0 },
            });
          }
          break;
        }

        case "toText": {
          const fieldName = opts.fieldName ?? "data";
          output.push({
            json: { ...item.json, [fieldName]: text },
            binary: item.binary,
            pairedItem: item.pairedItem ?? { item: itemIndex, input: 0 },
          });
          break;
        }

        case "ods":
        case "xls":
        case "xlsx":
          throw new Error(
            `Extract from File: operation "${operation}" is not yet implemented (requires spreadsheet library). TODO.`,
          );

        default:
          throw new Error(`Extract from File: unknown operation "${operation}"`);
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
};