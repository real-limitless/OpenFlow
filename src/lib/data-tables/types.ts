export type DataTableColumnType = "string" | "number" | "boolean" | "date";

export interface DataTableColumn {
  id: string;
  name: string;
  type: DataTableColumnType;
}

export interface DataTableMeta {
  id: string;
  name: string;
  columns: DataTableColumn[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DataTableDetail extends DataTableMeta {
  rows: DataTableRowDto[];
  /** Filtered total when q/limit/offset applied */
  totalRows?: number;
  offset?: number;
  limit?: number | null;
}

export interface DataTableRowDto {
  id: string;
  data: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export const COLUMN_TYPES: DataTableColumnType[] = ["string", "number", "boolean", "date"];

export function newColumnId(): string {
  return `col_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultColumns(): DataTableColumn[] {
  return [{ id: newColumnId(), name: "Column 1", type: "string" }];
}

export function parseColumns(raw: string | null | undefined): DataTableColumn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .map((c) => ({
        id: typeof c.id === "string" ? c.id : newColumnId(),
        name: typeof c.name === "string" && c.name.trim() ? c.name.trim() : "Column",
        type: isColumnType(c.type) ? c.type : "string",
      }));
  } catch {
    return [];
  }
}

export function parseRowData(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function isColumnType(v: unknown): v is DataTableColumnType {
  return v === "string" || v === "number" || v === "boolean" || v === "date";
}

export function normalizeColumns(input: unknown): DataTableColumn[] | null {
  if (!Array.isArray(input)) return null;
  const out: DataTableColumn[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" && c.id ? c.id : newColumnId();
    if (seen.has(id)) continue;
    seen.add(id);
    const name = typeof c.name === "string" && c.name.trim() ? c.name.trim() : "Column";
    const type = isColumnType(c.type) ? c.type : "string";
    out.push({ id, name, type });
  }
  return out;
}

/** Keep only keys that still exist as columns; coerce empty missing keys. */
export function projectRowData(
  data: Record<string, unknown>,
  columns: DataTableColumn[],
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const col of columns) {
    if (Object.prototype.hasOwnProperty.call(data, col.id)) {
      next[col.id] = data[col.id];
    }
  }
  return next;
}
