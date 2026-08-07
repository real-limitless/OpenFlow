import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  statusBarClass,
  statusColumnClass,
  statusPlayClass,
} from "./status-styles";
import { KANBAN_COLUMNS, type ExecutionEntry, type ExecutionStatus } from "./types";

const COLUMN_LABELS: Record<ExecutionStatus, string> = {
  pending: "Pending",
  running: "Running",
  success: "Success",
  error: "Error",
  skipped: "Skipped",
};

export function ExecutionKanbanView({
  entries,
  selectedName,
  onSelect,
}: {
  entries: ExecutionEntry[];
  selectedName?: string | null;
  onSelect: (name: string) => void;
}) {
  const byStatus = new Map<ExecutionStatus, ExecutionEntry[]>();
  for (const col of KANBAN_COLUMNS) byStatus.set(col, []);
  for (const e of entries) {
    byStatus.get(e.status)?.push(e);
  }

  const visible = KANBAN_COLUMNS.filter((col) => (byStatus.get(col)?.length ?? 0) > 0);
  const columns = visible.length > 0 ? visible : KANBAN_COLUMNS;

  return (
    <div className="flex h-full min-h-0 gap-2 overflow-x-auto overscroll-contain p-2">
      {columns.map((col) => {
        const cards = byStatus.get(col) ?? [];
        return (
          <div
            key={col}
            className={cn("flex w-48 shrink-0 flex-col rounded-md border", statusColumnClass(col))}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-2 py-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {COLUMN_LABELS[col]}
              </span>
              <Badge
                variant="secondary"
                className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px]"
              >
                {cards.length}
              </Badge>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
              {cards.map((entry) => {
                const isSelected = selectedName === entry.name;
                return (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => onSelect(entry.name)}
                    className={cn(
                      "w-full rounded-md border bg-background/80 p-2 text-left transition-colors hover:bg-accent/60",
                      isSelected ? "border-primary/50 ring-1 ring-primary/25" : "border-border/50",
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      <Play
                        className={cn("mt-0.5 size-3 shrink-0", statusPlayClass(entry.status))}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">
                        {entry.name}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      {entry.itemCount > 0 && (
                        <span>
                          {entry.itemCount} item{entry.itemCount === 1 ? "" : "s"}
                        </span>
                      )}
                      <span>{formatDuration(entry.durationMs)}</span>
                    </div>
                    {entry.error && (
                      <p className="mt-1 line-clamp-2 font-mono text-[10px] text-destructive">
                        {entry.error}
                      </p>
                    )}
                    <div
                      className={cn("mt-1.5 h-0.5 rounded-full", statusBarClass(entry.status))}
                    />
                  </button>
                );
              })}
              {cards.length === 0 && (
                <p className="px-1 py-4 text-center text-[10px] text-muted-foreground">Empty</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
