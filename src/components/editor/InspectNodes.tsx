import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Image as ImageIcon, RefreshCw, Table2 } from "lucide-react";
import type { OpenFlowNode } from "@/lib/workflow/graph";
import type { ExecutionRunData } from "@/lib/engine/types";
import type { DataTableColumn, DataTableRowDto } from "@/lib/data-tables/types";
import { apiFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function cellDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function InspectTableInner({ data }: NodeProps<OpenFlowNode>) {
  const params = data.node.parameters as {
    tableId?: string;
    limit?: number;
    width?: number;
    height?: number;
  };
  const refreshKey = (data as Record<string, unknown>).refreshKey as number | undefined;
  const tableId = (params.tableId ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(params.limit) || 20));
  const width = params.width ?? 360;
  const height = params.height ?? 240;

  const [columns, setColumns] = useState<DataTableColumn[]>([]);
  const [rows, setRows] = useState<DataTableRowDto[]>([]);
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tableId) {
      setColumns([]);
      setRows([]);
      setName("");
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/v1/data-tables/${encodeURIComponent(tableId)}?limit=${limit}`,
      );
      if (!res.ok) throw new Error("Failed to load table");
      const body = (await res.json()) as {
        name?: string;
        columns?: DataTableColumn[];
        rows?: DataTableRowDto[];
      };
      setName(body.name ?? tableId);
      setColumns(body.columns ?? []);
      setRows((body.rows ?? []).slice(0, limit));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setColumns([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tableId, limit]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div
      className="of-node-shell flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md"
      style={{ width, height }}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-sidebar/80 px-2 py-1.5">
        <Table2 className="size-3.5 text-primary" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">
          {name || "Inspect: Table"}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="nodrag nopan size-6"
          title="Refresh"
          disabled={!tableId || loading}
          onClick={(e) => {
            e.stopPropagation();
            void load();
          }}
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
        </Button>
      </div>
      <div className="nodrag nopan min-h-0 flex-1 overflow-auto p-0">
        {!tableId ? (
          <p className="p-2 text-[11px] text-muted-foreground">
            Select this node and set Data Table ID in Properties.
          </p>
        ) : error ? (
          <p className="p-2 text-[11px] text-destructive">{error}</p>
        ) : columns.length === 0 ? (
          <p className="p-2 text-[11px] text-muted-foreground">
            {loading ? "Loading…" : "No columns"}
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-[10px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border">
                {columns.map((c) => (
                  <th
                    key={c.id}
                    className="px-1.5 py-1 font-mono text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-1.5 py-2 text-muted-foreground">
                    No rows
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/40">
                    {columns.map((c) => (
                      <td key={c.id} className="max-w-[8rem] truncate px-1.5 py-0.5 font-mono">
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
    </div>
  );
}

function mediaFromRunData(
  runData: ExecutionRunData | null | undefined,
  sourceNode: string,
  binaryProperty: string,
): { dataUrl?: string; mimeType?: string; fileName?: string } | null {
  if (!runData || !sourceNode) return null;
  const nodeData = runData[sourceNode];
  if (!nodeData) return null;
  for (const branch of nodeData.items ?? []) {
    for (const item of branch ?? []) {
      const binary = (item as { binary?: Record<string, unknown> })?.binary;
      if (!binary) continue;
      const key = binaryProperty && binary[binaryProperty] ? binaryProperty : Object.keys(binary)[0];
      if (!key) continue;
      const bin = binary[key] as {
        mimeType?: string;
        data?: string;
        fileName?: string;
      };
      if (!bin) continue;
      const mime = bin.mimeType ?? "";
      let dataUrl: string | undefined;
      if (typeof bin.data === "string" && bin.data.startsWith("data:")) {
        dataUrl = bin.data;
      } else if (typeof bin.data === "string" && mime) {
        dataUrl = `data:${mime};base64,${bin.data}`;
      }
      return { dataUrl, mimeType: mime, fileName: bin.fileName };
    }
  }
  return null;
}

function InspectMediaInner({ data }: NodeProps<OpenFlowNode>) {
  const params = data.node.parameters as {
    sourceNode?: string;
    binaryProperty?: string;
    width?: number;
    height?: number;
  };
  const runData = (data as Record<string, unknown>).runData as ExecutionRunData | null | undefined;
  const sourceNode = (params.sourceNode ?? "").trim();
  const binaryProperty = (params.binaryProperty ?? "data").trim() || "data";
  const width = params.width ?? 320;
  const height = params.height ?? 240;

  const media = useMemo(
    () => mediaFromRunData(runData, sourceNode, binaryProperty),
    [runData, sourceNode, binaryProperty],
  );

  const isVideo = media?.mimeType?.startsWith("video/");

  return (
    <div
      className="of-node-shell flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md"
      style={{ width, height }}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-sidebar/80 px-2 py-1.5">
        <ImageIcon className="size-3.5 text-primary" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">
          {sourceNode || "Inspect: Media"}
        </span>
      </div>
      <div className="nodrag nopan flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background/40 p-1">
        {!sourceNode ? (
          <p className="p-2 text-center text-[11px] text-muted-foreground">
            Set Source Node in Properties to a node that outputs binary media.
          </p>
        ) : !media?.dataUrl ? (
          <p className="p-2 text-center text-[11px] text-muted-foreground">
            No binary yet — run the workflow or check binary property “{binaryProperty}”.
          </p>
        ) : isVideo ? (
          <video src={media.dataUrl} controls className="max-h-full max-w-full" />
        ) : (
          <img
            src={media.dataUrl}
            alt={media.fileName ?? sourceNode}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>
    </div>
  );
}

export const InspectTableNode = memo(InspectTableInner);
export const InspectMediaNode = memo(InspectMediaInner);
