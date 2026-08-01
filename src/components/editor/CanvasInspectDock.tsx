import { useMemo, useState } from "react";
import { ChevronDown, Image as ImageIcon, Pin, Table2, X } from "lucide-react";
import type { ExecutionRunData } from "@/lib/engine/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTablesPanel } from "./DataTablesPanel";
import { cn } from "@/lib/utils";

function findMediaInRunData(runData: ExecutionRunData | null): Array<{
  node: string;
  key: string;
  mimeType?: string;
  dataUrl?: string;
  fileName?: string;
}> {
  if (!runData) return [];
  const out: Array<{
    node: string;
    key: string;
    mimeType?: string;
    dataUrl?: string;
    fileName?: string;
  }> = [];
  for (const [node, data] of Object.entries(runData)) {
    const branches = data.items ?? [];
    for (const branch of branches) {
      for (const item of branch ?? []) {
        const binary = (item as { binary?: Record<string, unknown> })?.binary;
        if (!binary || typeof binary !== "object") continue;
        for (const [key, bin] of Object.entries(binary)) {
          if (!bin || typeof bin !== "object") continue;
          const b = bin as {
            mimeType?: string;
            data?: string;
            fileName?: string;
          };
          const mime = b.mimeType ?? "";
          if (!mime.startsWith("image/") && !b.data) continue;
          let dataUrl: string | undefined;
          if (typeof b.data === "string" && b.data.startsWith("data:")) {
            dataUrl = b.data;
          } else if (typeof b.data === "string" && mime.startsWith("image/")) {
            dataUrl = `data:${mime};base64,${b.data}`;
          }
          out.push({ node, key, mimeType: mime, dataUrl, fileName: b.fileName });
        }
      }
    }
  }
  return out.slice(0, 12);
}

function lastNodeJson(runData: ExecutionRunData | null): { node: string; sample: unknown } | null {
  if (!runData) return null;
  const names = Object.keys(runData);
  if (!names.length) return null;
  const node = names[names.length - 1]!;
  const items = runData[node]?.items?.[0] ?? [];
  const sample = items.slice(0, 3).map((it) => (it as { json?: unknown })?.json ?? it);
  return { node, sample };
}

export function CanvasInspectDock({
  runData,
  refreshKey = 0,
}: {
  runData: ExecutionRunData | null;
  refreshKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const media = useMemo(() => findMediaInRunData(runData), [runData]);
  const jsonSample = useMemo(() => lastNodeJson(runData), [runData]);

  // Auto-open when execution produces data and user has not dismissed without pin
  const visible = open || pinned;

  if (!visible) {
    return (
      <div className="pointer-events-auto absolute bottom-3 left-3 z-20">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-1.5 border border-border bg-surface/95 text-[11px] shadow-md backdrop-blur"
          onClick={() => setOpen(true)}
        >
          <Pin className="size-3.5" />
          Inspect
          {runData && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {Object.keys(runData).length}
            </Badge>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-3 left-3 z-20 flex w-[min(420px,calc(100%-1.5rem))] flex-col",
        "overflow-hidden rounded-lg border border-border bg-surface/95 shadow-lg backdrop-blur",
      )}
      style={{ maxHeight: "min(42vh, 360px)" }}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Inspect
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-7"
          title={pinned ? "Unpin" : "Pin open"}
          onClick={() => setPinned((p) => !p)}
        >
          <Pin className={cn("size-3.5", pinned && "text-primary")} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          title="Collapse"
          onClick={() => {
            setOpen(false);
            setPinned(false);
          }}
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          title="Close"
          onClick={() => {
            setOpen(false);
            setPinned(false);
          }}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <Tabs defaultValue="table" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-2 mt-1.5 grid h-8 w-auto grid-cols-3">
          <TabsTrigger value="table" className="gap-1 text-[10px]">
            <Table2 className="size-3" />
            Tables
          </TabsTrigger>
          <TabsTrigger value="json" className="text-[10px]">
            JSON
          </TabsTrigger>
          <TabsTrigger value="media" className="gap-1 text-[10px]">
            <ImageIcon className="size-3" />
            Media
          </TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <div className="h-[240px]">
            <DataTablesPanel refreshKey={refreshKey} />
          </div>
        </TabsContent>
        <TabsContent value="json" className="mt-0 min-h-0 flex-1 overflow-auto p-2 data-[state=inactive]:hidden">
          {!jsonSample ? (
            <p className="text-[11px] text-muted-foreground">Run the workflow to see node output here.</p>
          ) : (
            <div className="space-y-1">
              <p className="font-mono text-[10px] text-muted-foreground">Last: {jsonSample.node}</p>
              <pre className="overflow-auto rounded-md border border-border bg-background/60 p-2 font-mono text-[10px] leading-relaxed">
                {JSON.stringify(jsonSample.sample, null, 2)}
              </pre>
            </div>
          )}
        </TabsContent>
        <TabsContent value="media" className="mt-0 min-h-0 flex-1 overflow-auto p-2 data-[state=inactive]:hidden">
          {media.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No image binary found in the current execution data.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {media.map((m, i) => (
                <div
                  key={`${m.node}-${m.key}-${i}`}
                  className="overflow-hidden rounded-md border border-border bg-background/50"
                >
                  {m.dataUrl ? (
                    <img
                      src={m.dataUrl}
                      alt={m.fileName ?? m.key}
                      className="max-h-28 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-20 items-center justify-center text-[10px] text-muted-foreground">
                      {m.mimeType || "binary"}
                    </div>
                  )}
                  <p className="truncate px-1.5 py-1 font-mono text-[9px] text-muted-foreground">
                    {m.node} · {m.key}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
