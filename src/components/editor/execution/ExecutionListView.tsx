import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ExecutionEntryDetail } from "./ExecutionEntryDetail";
import { statusBadgeVariant, statusPlayClass } from "./status-styles";
import type { ExecutionEntry } from "./types";

export function ExecutionListView({
  entries,
  selectedName,
  onSelect,
}: {
  entries: ExecutionEntry[];
  selectedName?: string | null;
  onSelect: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      next[e.name] = e.status === "error" || e.status === "running" || i === entries.length - 1;
    }
    setExpanded(next);
  }, [entries]);

  const toggle = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="space-y-1 p-2">
        {entries.map((entry) => {
          const isOpen = expanded[entry.name] ?? false;
          const isSelected = selectedName === entry.name;

          return (
            <Collapsible key={entry.name} open={isOpen} onOpenChange={() => toggle(entry.name)}>
              <div
                className={cn(
                  "rounded-md border bg-background/40",
                  isSelected ? "border-primary/50 ring-1 ring-primary/20" : "border-border/60",
                )}
              >
                <div className="flex items-stretch">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-accent/50"
                    >
                      {isOpen ? (
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <Play className={cn("size-3 shrink-0", statusPlayClass(entry.status))} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium">
                        {entry.name}
                      </span>
                      {entry.itemCount > 0 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {entry.itemCount} item{entry.itemCount === 1 ? "" : "s"}
                        </span>
                      )}
                      <Badge
                        variant={statusBadgeVariant(entry.status)}
                        className="shrink-0 text-[10px]"
                      >
                        {entry.status}
                      </Badge>
                    </button>
                  </CollapsibleTrigger>
                  <button
                    type="button"
                    className="shrink-0 border-l border-border/50 px-2 text-[10px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    title="Select node"
                    onClick={() => onSelect(entry.name)}
                  >
                    Open
                  </button>
                </div>
                <CollapsibleContent>
                  <ExecutionEntryDetail entry={entry} />
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
