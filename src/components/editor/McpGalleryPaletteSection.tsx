import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NodeIcon } from "./BaseNode";
import { cn } from "@/lib/utils";
import { fetchMcpGallery } from "@/lib/nodes/mcp-flow/client";
import { MCP_CLIENT_NODE_TYPE, type McpGalleryIndexRow } from "@/lib/nodes/mcp-flow/types";
import type { AddNodeInit } from "@/lib/workflow/add-node";
import { encodeNodeDragPayload, OPENFLOW_NODE_MIME } from "@/lib/workflow/add-node";

const accentAction = "text-[var(--action)] bg-[var(--action)]/12";

function transportOf(row: McpGalleryIndexRow): "sse" | "httpStreamable" {
  return row.transport === "sse" ? "sse" : "httpStreamable";
}

function Row({
  row,
  onAdd,
}: {
  row: McpGalleryIndexRow;
  onAdd: (type: string, init?: AddNodeInit) => void;
}) {
  const init: AddNodeInit = {
    name: row.title,
    parameters: {
      endpointUrl: row.endpointUrl || "",
      sseEndpoint: row.transport === "sse" ? row.endpointUrl || "" : "",
      serverTransport: transportOf(row),
    },
  };
  return (
    <button
      type="button"
      draggable={Boolean(row.endpointUrl)}
      onDragStart={(e) => {
        if (!row.endpointUrl) return;
        e.dataTransfer.setData(
          OPENFLOW_NODE_MIME,
          encodeNodeDragPayload({
            type: MCP_CLIENT_NODE_TYPE,
            name: row.title,
            parameters: init.parameters,
          }),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => {
        if (row.endpointUrl) onAdd(MCP_CLIENT_NODE_TYPE, init);
      }}
      className="flex w-full items-start gap-2.5 rounded-md border border-transparent p-2 text-left transition hover:border-border hover:bg-surface"
    >
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded", accentAction)}>
        <NodeIcon name="Bot" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-[13px] font-medium text-foreground">{row.title}</span>
          <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
            {row.transport}
          </Badge>
        </span>
        <span className="block font-mono text-[10px] text-muted-foreground/90">{row.id}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{row.summary}</span>
      </span>
    </button>
  );
}

export function McpGalleryPaletteSection({
  query,
  onAdd,
}: {
  query: string;
  onAdd: (type: string, init?: AddNodeInit) => void;
}) {
  const q = query.trim();
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<McpGalleryIndexRow[]>([]);
  const [note, setNote] = useState("Type at least two characters to search mcp-flow catalog-data.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.length < 2) {
      setItems([]);
      setNote("Type at least two characters to search mcp-flow catalog-data.");
      return;
    }
    let cancelled = false;
    setBusy(true);
    void fetchMcpGallery({ q, limit: 40 })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items || []);
        setNote(
          data.error
            ? String(data.error)
            : data.items?.length
              ? `${data.items.length} from mcp-flow`
              : "No mcp-flow entries match.",
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setNote(err instanceof Error ? err.message : "mcp-flow catalog unreachable");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="flex-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            mcp-flow gallery
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
            {busy ? "…" : items.length}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mb-2 space-y-0.5 pl-1">
          {items.map((row) => (
            <Row key={row.id} row={row} onAdd={onAdd} />
          ))}
          <p className="px-2 py-1 text-[11px] text-muted-foreground">{note}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
