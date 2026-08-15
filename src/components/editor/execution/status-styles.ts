import type { ExecutionStatus } from "./types";

export function statusPlayClass(status: ExecutionStatus): string {
  switch (status) {
    case "running":
      return "animate-pulse text-blue-500";
    case "success":
      return "text-emerald-500";
    case "error":
      return "text-destructive";
    case "pending":
      return "text-muted-foreground";
    case "skipped":
      return "text-muted-foreground/70";
    default:
      return "text-muted-foreground";
  }
}

export function statusBadgeVariant(
  status: ExecutionStatus,
): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "success":
      return "default";
    case "error":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

export function statusBarClass(status: ExecutionStatus): string {
  switch (status) {
    case "running":
      return "bg-blue-500/80 animate-pulse";
    case "success":
      return "bg-emerald-500/80";
    case "error":
      return "bg-destructive/80";
    case "pending":
      return "bg-muted-foreground/30";
    case "skipped":
      return "bg-muted-foreground/20";
    default:
      return "bg-muted-foreground/40";
  }
}

export function statusColumnClass(status: ExecutionStatus): string {
  switch (status) {
    case "running":
      return "border-blue-500/30 bg-blue-500/5";
    case "success":
      return "border-emerald-500/30 bg-emerald-500/5";
    case "error":
      return "border-destructive/30 bg-destructive/5";
    case "pending":
      return "border-border/60 bg-background/30";
    case "skipped":
      return "border-border/40 bg-muted/20";
    default:
      return "border-border/60 bg-background/30";
  }
}

export function formatDuration(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
