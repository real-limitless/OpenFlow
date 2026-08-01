import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Pin,
  PinOff,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkflowStore } from "@/store/workflow-store";
import type { ExecutionRunData } from "@/lib/engine/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function DataPanel({ runData }: { runData?: ExecutionRunData | null }) {
  const [open, setOpen] = useState(true);
  const selected = useWorkflowStore((s) => s.selectedNode);
  const workflow = useWorkflowStore((s) => s.workflow);
  const setPinData = useWorkflowStore((s) => s.setPinData);
  const [draft, setDraft] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pinned = selected ? workflow.pinData?.[selected] : undefined;
  const runNodeNames = runData ? Object.keys(runData) : [];
  const hasRunData = runNodeNames.length > 0;
  const columns = useMemo(() => {
    const keys = new Set<string>();
    (pinned ?? []).forEach((item) => Object.keys(item.json ?? {}).forEach((k) => keys.add(k)));
    return [...keys];
  }, [pinned]);

  useEffect(() => {
    if (hasRunData) setOpen(true);
  }, [hasRunData]);

  useEffect(() => {
    if (!runData) {
      setExpanded({});
      return;
    }
    const next: Record<string, boolean> = {};
    const names = Object.keys(runData);
    for (const name of names) {
      const status = runData[name]?.status;
      next[name] = status === "error" || status === "running" || name === names[names.length - 1];
    }
    setExpanded(next);
  }, [runData]);

  const toggleNode = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-sidebar">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 shrink-0 items-center gap-2 px-3 text-left text-[12px] text-muted-foreground hover:text-foreground"
      >
        <Database className="size-4" />
        <span className="font-mono uppercase tracking-wider">Execution data</span>
        {selected && <span className="text-foreground">· {selected}</span>}
        {hasRunData && (
          <Badge variant="secondary" className="text-[10px]">
            {runNodeNames.length} nodes
          </Badge>
        )}
        {pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] text-primary">
            <Pin className="size-2.5" /> pinned {pinned.length}
          </span>
        )}
        <span className="ml-auto">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>

      {open && (
        <div className="min-h-0 flex-1 overflow-hidden border-t border-border">
          {!selected && hasRunData ? (
            <div className="h-full overflow-y-auto overscroll-contain">
              <div className="space-y-1 p-2">
                {runNodeNames.map((nodeName) => {
                  const data = runData![nodeName] as ExecutionRunData[string];
                  const isOpen = expanded[nodeName] ?? false;
                  const itemCount =
                    data.items?.reduce((sum, branch) => sum + (branch?.length ?? 0), 0) ?? 0;

                  return (
                    <Collapsible
                      key={nodeName}
                      open={isOpen}
                      onOpenChange={() => toggleNode(nodeName)}
                    >
                      <div className="rounded-md border border-border/60 bg-background/40">
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-accent/50"
                          >
                            {isOpen ? (
                              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <Play
                              className={cn(
                                "size-3 shrink-0",
                                data.status === "running" && "animate-pulse text-blue-500",
                                data.status === "success" && "text-emerald-500",
                                data.status === "error" && "text-destructive",
                                data.status === "pending" && "text-muted-foreground",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium">
                              {nodeName}
                            </span>
                            {itemCount > 0 && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {itemCount} item{itemCount === 1 ? "" : "s"}
                              </span>
                            )}
                            <Badge
                              variant={
                                data.status === "success"
                                  ? "default"
                                  : data.status === "error"
                                    ? "destructive"
                                    : data.status === "running"
                                      ? "secondary"
                                      : "outline"
                              }
                              className="shrink-0 text-[10px]"
                            >
                              {data.status}
                            </Badge>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-2 border-t border-border/50 px-2.5 py-2">
                            {data.status === "error" && data.error && (
                              <div className="rounded border border-destructive/40 bg-destructive/10 p-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] font-medium text-destructive">
                                    Error
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="ml-auto h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/15"
                                    onClick={() => {
                                      void navigator.clipboard
                                        .writeText(
                                          JSON.stringify(
                                            {
                                              node: nodeName,
                                              status: data.status,
                                              error: data.error,
                                              startedAt: data.startedAt,
                                              finishedAt: data.finishedAt,
                                            },
                                            null,
                                            2,
                                          ),
                                        )
                                        .then(() => toast.success("Error copied"));
                                    }}
                                  >
                                    <Copy className="mr-1 size-3" /> Copy
                                  </Button>
                                </div>
                                <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-destructive">
                                  {data.error}
                                </pre>
                              </div>
                            )}
                            {data.items && data.items.length > 0 ? (
                              <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
                                {JSON.stringify(data.items, null, 2)}
                              </pre>
                            ) : data.status !== "error" ? (
                              <p className="px-1 py-2 text-[11px] text-muted-foreground">
                                {data.status === "running"
                                  ? "Node is running…"
                                  : data.status === "pending"
                                    ? "Waiting to run…"
                                    : "No output items"}
                              </p>
                            ) : null}
                            {(data.startedAt || data.finishedAt) && (
                              <p className="px-1 text-[10px] text-muted-foreground">
                                {data.startedAt && `started ${new Date(data.startedAt).toLocaleTimeString()}`}
                                {data.startedAt && data.finishedAt && " · "}
                                {data.finishedAt && `finished ${new Date(data.finishedAt).toLocaleTimeString()}`}
                              </p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          ) : !selected ? (
            <p className="p-4 text-[13px] text-muted-foreground">
              Select a node to pin sample items. Pinned data feeds the expression preview of
              downstream nodes.
            </p>
          ) : (
            <Tabs defaultValue="table" className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-2 px-3 py-2">
                <TabsList className="h-8">
                  <TabsTrigger value="table" className="h-6 text-[12px]">
                    Table
                  </TabsTrigger>
                  <TabsTrigger value="json" className="h-6 text-[12px]">
                    JSON
                  </TabsTrigger>
                  {selected && runData?.[selected] && (
                    <TabsTrigger value="output" className="h-6 text-[12px]">
                      Output
                    </TabsTrigger>
                  )}
                </TabsList>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 text-[12px]"
                  onClick={() => {
                    setPinData(selected, null);
                    setDraft(null);
                  }}
                  disabled={!pinned}
                >
                  <PinOff className="mr-1 size-3.5" /> Unpin
                </Button>
              </div>

              <TabsContent value="table" className="mt-0 min-h-0 flex-1 overflow-y-auto">
                {pinned?.length ? (
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-1.5">#</th>
                        {columns.map((c) => (
                          <th key={c} className="px-3 py-1.5 font-mono">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pinned.map((item, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-3 py-1.5 text-muted-foreground">{i}</td>
                          {columns.map((c) => (
                            <td key={c} className="px-3 py-1.5 font-mono">
                              {formatCell(item.json?.[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-4 text-[13px] text-muted-foreground">
                    No pinned data for this node. Switch to the JSON tab and paste an array of
                    items.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="json" className="mt-0 min-h-0 flex-1 px-3 pb-3">
                <Textarea
                  className="h-full min-h-[120px] resize-none font-mono text-[12px]"
                  value={draft ?? JSON.stringify(pinned ?? [{ json: {} }], null, 2)}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      if (Array.isArray(parsed)) {
                        setPinData(
                          selected,
                          parsed.map((p: unknown) =>
                            p && typeof p === "object" && "json" in (p as object)
                              ? (p as { json: Record<string, unknown> })
                              : { json: p as Record<string, unknown> },
                          ),
                        );
                        setDraft(null);
                      }
                    } catch {
                      /* keep the draft so the user can fix it */
                    }
                  }}
                />
              </TabsContent>

              {selected && runData?.[selected] && (
                <TabsContent value="output" className="mt-0 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                  <pre className="rounded bg-muted p-2 font-mono text-[11px]">
                    {JSON.stringify(runData[selected], null, 2)}
                  </pre>
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>
      )}
    </section>
  );
}

function formatCell(value: unknown) {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
