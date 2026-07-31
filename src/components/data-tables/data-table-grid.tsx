import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  DataTableColumn,
  DataTableColumnType,
  DataTableRowDto,
} from "@/lib/data-tables/types";
import { COLUMN_TYPES, newColumnId } from "@/lib/data-tables/types";

interface DataTableGridProps {
  tableId: string;
  columns: DataTableColumn[];
  rows: DataTableRowDto[];
  onColumnsChange: (columns: DataTableColumn[]) => Promise<void>;
  onRowsChange: () => void;
}

function cellDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function coerceValue(raw: string, type: DataTableColumnType): unknown {
  if (raw === "") return null;
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (type === "boolean") {
    const lower = raw.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
    return raw;
  }
  return raw;
}

export function DataTableGrid({
  tableId,
  columns,
  rows,
  onColumnsChange,
  onRowsChange,
}: DataTableGridProps) {
  const [editing, setEditing] = useState<{ rowId: string; colId: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const addColumn = async () => {
    const name = `Column ${columns.length + 1}`;
    await onColumnsChange([...columns, { id: newColumnId(), name, type: "string" }]);
  };

  const renameColumn = async (colId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onColumnsChange(columns.map((c) => (c.id === colId ? { ...c, name: trimmed } : c)));
  };

  const setColumnType = async (colId: string, type: DataTableColumnType) => {
    await onColumnsChange(columns.map((c) => (c.id === colId ? { ...c, type } : c)));
  };

  const removeColumn = async (colId: string) => {
    if (columns.length <= 1) {
      toast.error("Keep at least one column");
      return;
    }
    if (!confirm("Delete this column? Cell values in it will be removed.")) return;
    await onColumnsChange(columns.filter((c) => c.id !== colId));
  };

  const addRow = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/data-tables/${tableId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
      });
      if (!res.ok) throw new Error("Failed to add row");
      onRowsChange();
    } catch {
      toast.error("Could not add row");
    } finally {
      setBusy(false);
    }
  };

  const deleteRow = async (rowId: string) => {
    if (!confirm("Delete this row?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/data-tables/${tableId}/rows/${rowId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      onRowsChange();
    } catch {
      toast.error("Could not delete row");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (rowId: string, colId: string, value: unknown) => {
    setEditing({ rowId, colId });
    setDraft(cellDisplay(value));
  };

  const commitEdit = async () => {
    if (!editing) return;
    const col = columns.find((c) => c.id === editing.colId);
    if (!col) {
      setEditing(null);
      return;
    }
    const value = coerceValue(draft, col.type);
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/data-tables/${tableId}/rows/${editing.rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { [editing.colId]: value } }),
      });
      if (!res.ok) throw new Error("Failed");
      setEditing(null);
      onRowsChange();
    } catch {
      toast.error("Could not save cell");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void addRow()} disabled={busy}>
          <Plus className="mr-1 size-3.5" /> Add row
        </Button>
        <Button size="sm" variant="outline" onClick={() => void addColumn()} disabled={busy}>
          <Plus className="mr-1 size-3.5" /> Add column
        </Button>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id} className="min-w-[140px] align-top">
                  <div className="flex flex-col gap-1 py-1">
                    <Input
                      className="h-7 border-transparent bg-transparent px-1 text-[12px] font-medium text-foreground hover:border-border focus:border-border"
                      defaultValue={col.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== col.name) {
                          void renameColumn(col.id, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <select
                        className="h-6 rounded border border-border bg-background px-1 font-mono text-[10px] text-muted-foreground"
                        value={col.type}
                        onChange={(e) =>
                          void setColumnType(col.id, e.target.value as DataTableColumnType)
                        }
                      >
                        {COLUMN_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => void removeColumn(col.id)}
                        aria-label={`Delete column ${col.name}`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </TableHead>
              ))}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="h-24 text-center text-[13px] text-muted-foreground"
                >
                  No rows yet. Add a row to start editing.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((col) => {
                    const isEdit =
                      editing?.rowId === row.id && editing?.colId === col.id;
                    const value = row.data[col.id];
                    return (
                      <TableCell key={col.id} className="p-1">
                        {isEdit ? (
                          <Input
                            autoFocus
                            className="h-8 font-mono text-[12px]"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => void commitEdit()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void commitEdit();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            disabled={busy}
                          />
                        ) : (
                          <button
                            type="button"
                            className="flex min-h-8 w-full items-center rounded px-2 text-left font-mono text-[12px] hover:bg-muted/60"
                            onClick={() => startEdit(row.id, col.id, value)}
                          >
                            <span className={value == null || value === "" ? "text-muted-foreground/50" : ""}>
                              {cellDisplay(value) || "—"}
                            </span>
                          </button>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="p-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => void deleteRow(row.id)}
                      disabled={busy}
                      aria-label="Delete row"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
