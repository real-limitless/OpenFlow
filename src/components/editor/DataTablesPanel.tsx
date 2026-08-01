import { useCallback, useEffect, useState } from "react";
import { Pin, RefreshCw, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/auth/client";
import type { DataTableColumn, DataTableMeta, DataTableRowDto } from "@/lib/data-tables/types";
import { useWorkflowStore } from "@/store/workflow-store";
import { INSPECT_TABLE_TYPE } from "@/lib/nodes/registry";
import { cn } from "@/lib/utils";

function cellDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DataTablesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const addNode = useWorkflowStore((s) => s.addNode);
  const updateParameters = useWorkflowStore((s) => s.updateParameters);
  const workflow = useWorkflowStore((s) => s.workflow);
  const [tables, setTables] = useState<DataTableMeta[]>([]);
  const [tableId, setTableId] = useState<string>("");
  const [columns, setColumns] = useState<DataTableColumn[]>([]);
  const [rows, setRows] = useState<DataTableRowDto[]>([]);
  const [loading, setLoading] = useState(false);

  const pinToCanvas = () => {
    if (!tableId) return;
    const name = addNode(INSPECT_TABLE_TYPE, {
      x: 120 + workflow.nodes.length * 36,
      y: 100 + (workflow.nodes.length % 5) * 40,
    });
    const node = useWorkflowStore.getState().workflow.nodes.find((n) => n.name === name);
    if (node) {
      updateParameters(name, { ...node.parameters, tableId });
    }
    toast.success("Pinned table to canvas");
  };

  const loadTables = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/data-tables");
      if (!res.ok) throw new Error("Failed to load tables");
      const list = (await res.json()) as DataTableMeta[];
      setTables(list);
      setTableId((prev) => prev || list[0]?.id || "");
    } catch {
      setTables([]);
    }
  }, []);

  const loadRows = useCallback(async (id: string) => {
    if (!id) {
      setColumns([]);
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/data-tables/${id}`);
      if (!res.ok) throw new Error("Failed to load table");
      const data = (await res.json()) as {
        columns?: DataTableColumn[];
        rows?: DataTableRowDto[];
        name?: string;
      };
      setColumns(data.columns ?? []);
      setRows(data.rows ?? []);
    } catch {
      toast.error("Could not load table rows");
      setColumns([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTables();
    const onScope = () => void loadTables();
    window.addEventListener("openflow:scope-change", onScope);
    return () => window.removeEventListener("openflow:scope-change", onScope);
  }, [loadTables]);

  useEffect(() => {
    if (tableId) void loadRows(tableId);
  }, [tableId, refreshKey, loadRows]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Table2 className="size-4 text-muted-foreground" />
        <span className="font-mono text-[12px] uppercase tracking-wider text-muted-foreground">
          Data tables
        </span>
        {tableId && (
          <Badge variant="secondary" className="text-[10px]">
            {rows.length} rows
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Select value={tableId || undefined} onValueChange={setTableId}>
            <SelectTrigger className="h-7 w-44 text-[11px]">
              <SelectValue placeholder="Select table" />
            </SelectTrigger>
            <SelectContent>
              {tables.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-[12px]">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            title="Pin table to canvas"
            disabled={!tableId}
            onClick={pinToCanvas}
          >
            <Pin className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            title="Refresh"
            disabled={!tableId || loading}
            onClick={() => tableId && void loadRows(tableId)}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!tableId ? (
          <p className="p-4 text-[12px] text-muted-foreground">
            No data tables yet. Create one from the Tables page, then refresh here to inspect rows
            during workflow runs.
          </p>
        ) : columns.length === 0 ? (
          <p className="p-4 text-[12px] text-muted-foreground">
            {loading ? "Loading…" : "This table has no columns."}
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 bg-sidebar">
              <tr className="border-b border-border">
                {columns.map((c) => (
                  <th
                    key={c.id}
                    className="px-2 py-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-2 py-4 text-center text-muted-foreground"
                  >
                    No rows
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-accent/30">
                    {columns.map((c) => (
                      <td key={c.id} className="max-w-[12rem] truncate px-2 py-1 font-mono">
                        {cellDisplay(row.data?.[c.id] ?? row.data?.[c.name])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
