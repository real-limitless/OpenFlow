import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NodeIcon } from "./BaseNode";
import { cn } from "@/lib/utils";
import { fetchMcpFlowBackends, fetchMcpFlowConnection } from "@/lib/nodes/mcp-flow/client";
import {
  MCP_CLIENT_NODE_TYPE,
  MCP_FLOW_API_CREDENTIAL,
  type McpFlowBackend,
} from "@/lib/nodes/mcp-flow/types";
import type { AddNodeInit } from "@/lib/workflow/add-node";
import { encodeNodeDragPayload, OPENFLOW_NODE_MIME } from "@/lib/workflow/add-node";

const accentAction = "text-[var(--action)] bg-[var(--action)]/12";

function backendInit(
  backend: McpFlowBackend,
  credential?: { id: string; name: string },
): AddNodeInit {
  const init: AddNodeInit = {
    name: backend.title || backend.slug,
    parameters: {
      source: "mcpFlow",
      backends: [backend.slug],
    },
  };
  if (credential) {
    init.credentials = {
      [MCP_FLOW_API_CREDENTIAL]: { id: credential.id, name: credential.name },
    };
  }
  return init;
}

export function McpFlowBackendsPaletteSection({
  onAdd,
}: {
  onAdd: (type: string, init?: AddNodeInit) => void;
}) {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<McpFlowBackend[]>([]);
  const [credential, setCredential] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState("Connect mcp-flow in Settings to list backends.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void fetchMcpFlowConnection()
      .then(async (conn) => {
        if (cancelled) return;
        if (!conn.connected || !conn.credential) {
          setCredential(null);
          setItems([]);
          setNote("Connect mcp-flow in Settings to list backends.");
          return;
        }
        setCredential({ id: conn.credential.id, name: conn.credential.name });
        const listed = await fetchMcpFlowBackends({ credentialId: conn.credential.id });
        if (cancelled) return;
        setItems(listed.items ?? []);
        setNote(
          listed.items?.length
            ? `${listed.items.length} connected backends`
            : "No backends on this gateway.",
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setNote(err instanceof Error ? err.message : "mcp-flow backends unreachable");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
            mcp-flow backends
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
            {busy ? "…" : items.length}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mb-2 space-y-0.5 pl-1">
          {items.map((row) => {
            const init = backendInit(row, credential ?? undefined);
            return (
              <button
                key={row.slug}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    OPENFLOW_NODE_MIME,
                    encodeNodeDragPayload({
                      type: MCP_CLIENT_NODE_TYPE,
                      name: init.name,
                      parameters: init.parameters,
                      credentials: init.credentials,
                    }),
                  );
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onAdd(MCP_CLIENT_NODE_TYPE, init)}
                className="flex w-full items-start gap-2.5 rounded-md border border-transparent p-2 text-left transition hover:border-border hover:bg-surface"
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded",
                    accentAction,
                  )}
                >
                  <NodeIcon name="Bot" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {row.title}
                    </span>
                    {row.transport && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                        {row.transport}
                      </Badge>
                    )}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground/90">
                    {row.slug}
                  </span>
                </span>
              </button>
            );
          })}
          <p className="px-2 py-1 text-[11px] text-muted-foreground">{note}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
