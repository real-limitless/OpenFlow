import type { DataTableColumn } from "./types";

/** Minimal RFC4180-ish CSV parse. Supports quoted fields and escaped quotes. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = splitCsvLines(text.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim()).filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

export function toCsv(
  columns: DataTableColumn[],
  rows: Array<{ data: Record<string, unknown> }>,
): string {
  const headers = columns.map((c) => c.name);
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    const cells = columns.map((c) => {
      const v = row.data[c.id];
      if (v == null) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    });
    lines.push(cells.map(escapeCsvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      lines.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

/** Map CSV header names → column ids (match by name, create missing via caller). */
export function mapCsvRowsToColumnIds(
  csvRows: Record<string, string>[],
  columns: DataTableColumn[],
): Record<string, unknown>[] {
  const byName = new Map(columns.map((c) => [c.name, c.id]));
  return csvRows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(row)) {
      const id = byName.get(name);
      if (id) out[id] = value === "" ? null : value;
    }
    return out;
  });
}
