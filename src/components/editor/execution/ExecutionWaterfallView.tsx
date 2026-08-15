import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatDuration, statusBarClass } from "./status-styles";
import type { ExecutionEntry } from "./types";

const ROW_H = 28;
const LABEL_W = 140;
const MIN_BAR_PCT = 1.2;

function timelineBounds(entries: ExecutionEntry[]) {
  let min = Infinity;
  let max = -Infinity;
  let hasTime = false;
  const now = Date.now();

  for (const e of entries) {
    if (e.startedAt) {
      const s = Date.parse(e.startedAt);
      if (Number.isFinite(s)) {
        hasTime = true;
        min = Math.min(min, s);
        const end = e.finishedAt ? Date.parse(e.finishedAt) : e.status === "running" ? now : s;
        if (Number.isFinite(end)) max = Math.max(max, end);
      }
    }
  }

  if (!hasTime || !Number.isFinite(min) || !Number.isFinite(max)) {
    return { hasTime: false as const, min: 0, max: 1, span: 1 };
  }
  if (max <= min) max = min + 1;
  return { hasTime: true as const, min, max, span: max - min };
}

export function ExecutionWaterfallView({
  entries,
  selectedName,
  onSelect,
}: {
  entries: ExecutionEntry[];
  selectedName?: string | null;
  onSelect: (name: string) => void;
}) {
  const bounds = useMemo(() => timelineBounds(entries), [entries]);

  const rows = useMemo(() => {
    return entries.map((e, index) => {
      if (bounds.hasTime && e.startedAt) {
        const start = Date.parse(e.startedAt);
        if (Number.isFinite(start)) {
          const endRaw = e.finishedAt
            ? Date.parse(e.finishedAt)
            : e.status === "running"
              ? Date.now()
              : start + Math.max(e.durationMs ?? 1, 1);
          const end = Number.isFinite(endRaw) ? endRaw : start + 1;
          const left = ((start - bounds.min) / bounds.span) * 100;
          const width = Math.max(MIN_BAR_PCT, ((end - start) / bounds.span) * 100);
          return { entry: e, left, width, slot: false as const };
        }
      }
      // Equal slots when timestamps missing
      const n = Math.max(entries.length, 1);
      const width = Math.max(MIN_BAR_PCT, 100 / n);
      const left = (index / n) * 100;
      return { entry: e, left, width, slot: true as const };
    });
  }, [entries, bounds]);

  const ticks = useMemo(() => {
    if (!bounds.hasTime) return [];
    const count = 5;
    return Array.from({ length: count }, (_, i) => {
      const t = bounds.min + (bounds.span * i) / (count - 1);
      return { pct: (i / (count - 1)) * 100, label: new Date(t).toLocaleTimeString() };
    });
  }, [bounds]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {!bounds.hasTime && (
        <p className="shrink-0 px-3 py-1 text-[10px] text-muted-foreground">
          No timestamps — showing run order as equal slots
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="min-w-[480px] p-2">
          {bounds.hasTime && (
            <div className="mb-1 flex" style={{ paddingLeft: LABEL_W }}>
              <div className="relative h-4 flex-1">
                {ticks.map((tick) => (
                  <span
                    key={tick.pct}
                    className="absolute top-0 -translate-x-1/2 font-mono text-[9px] text-muted-foreground"
                    style={{ left: `${tick.pct}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-0.5">
            {rows.map(({ entry, left, width, slot }) => {
              const isSelected = selectedName === entry.name;
              return (
                <button
                  key={entry.name}
                  type="button"
                  onClick={() => onSelect(entry.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-1 text-left hover:bg-accent/40",
                    isSelected && "bg-primary/10 ring-1 ring-primary/20",
                  )}
                  style={{ height: ROW_H }}
                  title={[
                    entry.name,
                    entry.status,
                    formatDuration(entry.durationMs),
                    entry.itemCount ? `${entry.itemCount} items` : null,
                    entry.error,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <span
                    className="shrink-0 truncate font-mono text-[11px] font-medium"
                    style={{ width: LABEL_W }}
                  >
                    {entry.name}
                  </span>
                  <div className="relative h-4 min-w-0 flex-1 rounded bg-muted/40">
                    <div
                      className={cn(
                        "absolute top-0 h-full rounded",
                        statusBarClass(entry.status),
                        slot && "opacity-70",
                      )}
                      style={{
                        left: `${Math.min(left, 100 - MIN_BAR_PCT)}%`,
                        width: `${Math.min(width, 100 - left)}%`,
                      }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {formatDuration(entry.durationMs)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
