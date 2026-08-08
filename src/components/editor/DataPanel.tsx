import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Database, Pin, PinOff } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import type { ExecutionRunData } from "@/lib/engine/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EXECUTION_LAYOUT_STORAGE_KEY,
  ExecutionKanbanView,
  ExecutionLayoutToggle,
  ExecutionListView,
  ExecutionWaterfallView,
  executionStats,
  useExecutionEntries,
  type ExecutionLayoutMode,
} from "@/components/editor/execution";
import {
  mergeNodeSampleData,
  resolveIncomingItems,
  type SampleItem,
} from "@/lib/editor/sample-data";

function readStoredLayout(): ExecutionLayoutMode {
  if (typeof window === "undefined") return "list";
  try {
    const v = localStorage.getItem(EXECUTION_LAYOUT_STORAGE_KEY);
    if (v === "list" || v === "waterfall" || v === "kanban") return v;
  } catch {
    /* ignore */
  }
  return "list";
}

export function DataPanel({ runData }: { runData?: ExecutionRunData | null }) {
  const [open, setOpen] = useState(true);
  const selected = useWorkflowStore((s) => s.selectedNode);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const workflow = useWorkflowStore((s) => s.workflow);
  const setPinData = useWorkflowStore((s) => s.setPinData);
  const [draft, setDraft] = useState<string | null>(null);
  const [layout, setLayout] = useState<ExecutionLayoutMode>(readStoredLayout);
  const [showOverview, setShowOverview] = useState(true);

  const pinned = selected ? workflow.pinData?.[selected] : undefined;
  const nodeOrder = useMemo(() => workflow.nodes.map((n) => n.name), [workflow.nodes]);
  const entries = useExecutionEntries(runData, nodeOrder);
  const hasRunData = entries.length > 0;
  const stats = useMemo(() => executionStats(entries), [entries]);

  const inputItems = useMemo((): SampleItem[] => {
    if (!selected) return [];
    const nodeData = mergeNodeSampleData(workflow.pinData, runData);
    return resolveIncomingItems(workflow.connections, selected, nodeData, runData);
  }, [selected, workflow.pinData, workflow.connections, runData]);

  const hasInput = inputItems.length > 0;
  const selectedOutput = selected ? runData?.[selected] : undefined;

  const columns = useMemo(() => {
    const keys = new Set<string>();
    (pinned ?? []).forEach((item) => Object.keys(item.json ?? {}).forEach((k) => keys.add(k)));
    return [...keys];
  }, [pinned]);

  const inputColumns = useMemo(() => {
    const keys = new Set<string>();
    inputItems.forEach((item) => Object.keys(item.json ?? {}).forEach((k) => keys.add(k)));
    return [...keys];
  }, [inputItems]);

  const defaultDetailTab = hasInput ? "input" : pinned?.length ? "table" : selectedOutput ? "output" : "table";

  useEffect(() => {
    if (hasRunData) {
      setOpen(true);
      setShowOverview(true);
    }
  }, [hasRunData]);

  useEffect(() => {
    try {
      localStorage.setItem(EXECUTION_LAYOUT_STORAGE_KEY, layout);
    } catch {
      /* ignore */
    }
  }, [layout]);

  const handleSelect = (name: string) => {
    selectNode(name);
    setShowOverview(false);
  };

  const overviewVisible = hasRunData && (showOverview || !selected);
  const detailVisible = Boolean(selected);

  return (
    <section className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3 text-[12px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-foreground"
        >
          <Database className="size-4 shrink-0" />
          <span className="font-mono uppercase tracking-wider">Execution data</span>
          {selected && <span className="truncate text-foreground">· {selected}</span>}
          {hasRunData && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {entries.length} nodes
            </Badge>
          )}
          {stats.error > 0 && (
            <Badge variant="destructive" className="shrink-0 text-[10px]">
              {stats.error} err
            </Badge>
          )}
          {stats.running > 0 && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {stats.running} run
            </Badge>
          )}
          {pinned && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] text-primary">
              <Pin className="size-2.5" /> pinned {pinned.length}
            </span>
          )}
          <span className="ml-auto shrink-0">
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </span>
        </button>
        {open && hasRunData && (
          <ExecutionLayoutToggle value={layout} onChange={setLayout} className="shrink-0" />
        )}
      </div>

      {open && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
          {!hasRunData && !selected && (
            <p className="p-4 text-[13px] text-muted-foreground">
              Select a node to pin sample items. Pinned data feeds the expression preview of
              downstream nodes. Run the workflow to inspect execution output here.
            </p>
          )}

          {overviewVisible && (
            <div
              className={
                detailVisible
                  ? "flex min-h-[7rem] shrink-0 basis-[42%] flex-col overflow-hidden border-b border-border"
                  : "flex min-h-0 flex-1 flex-col overflow-hidden"
              }
            >
              {layout === "list" && (
                <ExecutionListView
                  entries={entries}
                  selectedName={selected}
                  onSelect={handleSelect}
                />
              )}
              {layout === "waterfall" && (
                <ExecutionWaterfallView
                  entries={entries}
                  selectedName={selected}
                  onSelect={handleSelect}
                />
              )}
              {layout === "kanban" && (
                <ExecutionKanbanView
                  entries={entries}
                  selectedName={selected}
                  onSelect={handleSelect}
                />
              )}
            </div>
          )}

          {detailVisible && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {hasRunData && !showOverview && (
                <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setShowOverview(true)}
                  >
                    ← All nodes
                  </Button>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {selected}
                  </span>
                </div>
              )}
              <Tabs
                key={`${selected}-${defaultDetailTab}`}
                defaultValue={defaultDetailTab}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="flex shrink-0 items-center gap-2 px-3 py-2">
                  <TabsList className="h-8">
                    <TabsTrigger value="input" className="h-6 text-[12px]">
                      Input{hasInput ? ` (${inputItems.length})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="table" className="h-6 text-[12px]">
                      Pin
                    </TabsTrigger>
                    <TabsTrigger value="json" className="h-6 text-[12px]">
                      Pin JSON
                    </TabsTrigger>
                    {selectedOutput && (
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
                      if (!selected) return;
                      setPinData(selected, null);
                      setDraft(null);
                    }}
                    disabled={!pinned}
                  >
                    <PinOff className="mr-1 size-3.5" /> Unpin
                  </Button>
                </div>

                <TabsContent value="input" className="mt-0 min-h-0 flex-1 overflow-y-auto">
                  {hasInput ? (
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-3 py-1.5">#</th>
                          {inputColumns.map((c) => (
                            <th key={c} className="px-3 py-1.5 font-mono">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {inputItems.map((item, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-3 py-1.5 text-muted-foreground">{i}</td>
                            {inputColumns.map((c) => (
                              <td key={c} className="max-w-[14rem] truncate px-3 py-1.5 font-mono">
                                {formatCell(item.json?.[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-4 text-[13px] text-muted-foreground">
                      No input from previous nodes yet. Run the workflow, use{" "}
                      <strong>Previous</strong> on this node, or pin sample output on the upstream
                      node.
                    </p>
                  )}
                </TabsContent>

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
                      No pinned data for this node. Switch to Pin JSON and paste an array of items,
                      or pin upstream output from a prior run.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="json" className="mt-0 min-h-0 flex-1 px-3 pb-3">
                  <Textarea
                    className="h-full min-h-[120px] resize-none font-mono text-[12px]"
                    value={draft ?? JSON.stringify(pinned ?? [{ json: {} }], null, 2)}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={(e) => {
                      if (!selected) return;
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

                {selectedOutput && (
                  <TabsContent
                    value="output"
                    className="mt-0 min-h-0 flex-1 overflow-y-auto px-3 pb-3"
                  >
                    <pre className="rounded bg-muted p-2 font-mono text-[11px]">
                      {JSON.stringify(selectedOutput, null, 2)}
                    </pre>
                  </TabsContent>
                )}
              </Tabs>
            </div>
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
