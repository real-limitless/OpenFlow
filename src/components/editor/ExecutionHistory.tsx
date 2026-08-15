import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Execution {
  id: string;
  status: string;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
}

type ModeFilter = "all" | "manual" | "runtime";

function modeLabel(mode: string): string {
  if (mode === "runtime") return "Runtime";
  if (mode === "manual") return "Manual";
  if (mode === "webhook") return "Webhook";
  if (mode === "trigger") return "Trigger";
  return mode;
}

interface ExecutionHistoryProps {
  workflowId: string;
  refreshKey?: number;
  onSelectExecution: (runData: Record<string, unknown>) => void;
}

export function ExecutionHistory({
  workflowId,
  refreshKey = 0,
  onSelectExecution,
}: ExecutionHistoryProps) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");

  const fetchHistory = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/v1/workflows/${workflowId}/executions`);
        if (!res.ok) {
          if (res.status !== 404) {
            console.error("Failed to load executions", res.status);
          }
          setExecutions([]);
          return;
        }
        const data = (await res.json()) as Execution[];
        setExecutions(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load executions", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [workflowId],
  );

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory, refreshKey]);

  // Fast poll while any listed execution is in-flight
  useEffect(() => {
    const hasRunning = executions.some((e) => e.status === "running" || e.status === "waiting");
    if (!hasRunning) return;
    const t = setInterval(() => void fetchHistory({ silent: true }), 1500);
    return () => clearInterval(t);
  }, [executions, fetchHistory]);

  // Safety net: slow idle poll while the History panel is open (catches missed SSE)
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchHistory({ silent: true });
    };
    const t = setInterval(tick, 8000);
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchHistory({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchHistory]);

  const handleSelect = async (execId: string) => {
    setLoadingId(execId);
    setSelectedId(execId);
    try {
      const res = await fetch(`/api/v1/executions/${execId}`);
      if (!res.ok) {
        toast.error("Could not load execution");
        return;
      }
      const exec = await res.json();
      let runData: Record<string, unknown> = {};
      if (typeof exec.runData === "string" && exec.runData) {
        try {
          runData = JSON.parse(exec.runData) as Record<string, unknown>;
        } catch {
          toast.error("Execution data is invalid");
          return;
        }
      } else if (exec.runData && typeof exec.runData === "object") {
        runData = exec.runData as Record<string, unknown>;
      }

      if (Object.keys(runData).length === 0) {
        if (exec.status === "running") {
          toast.message("Execution still running");
        } else {
          toast.message("No run data for this execution");
        }
        return;
      }

      onSelectExecution(runData);
    } catch (err) {
      console.error("Failed to load execution", err);
      toast.error("Could not load execution");
    } finally {
      setLoadingId(null);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const visible = executions.filter((e) => {
    if (modeFilter === "all") return true;
    return e.mode === modeFilter;
  });

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium">Execution History</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => void fetchHistory()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
        </Button>
      </div>
      <div className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5">
        {(["all", "manual", "runtime"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setModeFilter(f)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
              modeFilter === f
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "all" ? "All" : f === "runtime" ? "Runtime" : "Manual"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-1 p-2">
          {visible.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {loading ? "Loading…" : "No executions yet"}
            </div>
          )}
          {visible.map((exec) => (
            <button
              key={exec.id}
              type="button"
              onClick={() => void handleSelect(exec.id)}
              disabled={loadingId === exec.id}
              className={cn(
                "flex w-full items-center gap-2 rounded-md p-2 text-left text-xs transition-colors",
                "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                selectedId === exec.id && "bg-accent",
                loadingId === exec.id && "opacity-70",
              )}
            >
              <Badge
                variant={
                  exec.status === "success"
                    ? "default"
                    : exec.status === "error"
                      ? "destructive"
                      : exec.status === "running"
                        ? "secondary"
                        : "outline"
                }
                className="shrink-0 text-[10px]"
              >
                {exec.status}
              </Badge>
              <span className="shrink-0 text-muted-foreground">{modeLabel(exec.mode)}</span>
              <span className="ml-auto truncate text-muted-foreground">
                {formatTime(exec.startedAt)}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatDuration(exec.startedAt, exec.finishedAt)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
