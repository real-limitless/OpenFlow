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
export declare const COLUMN_TYPES: DataTableColumnType[];
export declare function newColumnId(): string;
export declare function defaultColumns(): DataTableColumn[];
export declare function parseColumns(raw: string | null | undefined): DataTableColumn[];
export declare function parseRowData(raw: string | null | undefined): Record<string, unknown>;
export declare function isColumnType(v: unknown): v is DataTableColumnType;
export declare function normalizeColumns(input: unknown): DataTableColumn[] | null;
/** Keep only keys that still exist as columns; coerce empty missing keys. */
export declare function projectRowData(data: Record<string, unknown>, columns: DataTableColumn[]): Record<string, unknown>;
