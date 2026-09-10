import type { DataTableColumn } from "./types";
export interface DataTableRef {
    id: string;
    name: string;
    columns: DataTableColumn[];
}
export interface LoadRowsOptions {
    limit?: number;
    offset?: number;
    /** Case-insensitive substring match across cell values */
    search?: string;
}
/**
 * Injected into the execution engine so nodes can read/write product Data Tables
 * without importing Prisma directly.
 */
export interface DataTableAccess {
    listTables(): Promise<Array<{
        id: string;
        name: string;
    }>>;
    resolveTable(ref: string): Promise<DataTableRef | null>;
    /** Rows keyed by column display name; includes `_rowId` for updates/deletes. */
    loadRows(ref: string, opts?: LoadRowsOptions): Promise<Record<string, unknown>[]>;
    insertRows(ref: string, rows: Record<string, unknown>[]): Promise<number>;
    updateRows(ref: string, match: {
        column: string;
        value: unknown;
    }, fields: Record<string, unknown>): Promise<number>;
    deleteRows(ref: string, match?: {
        column: string;
        value: unknown;
    }): Promise<number>;
    clearRows(ref: string): Promise<number>;
    /**
     * Ensure columns exist for each field name (string type), then append one row.
     * Used by Evaluation setOutputs.
     */
    appendOutputRow(ref: string, fields: Record<string, unknown>): Promise<void>;
}
export declare function resolveLocatorValue(raw: unknown): string;
