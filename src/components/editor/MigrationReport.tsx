import { useMemo } from "react";
import { CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkflowStore } from "@/store/workflow-store";
import { getExecutorUnavailability } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { DEPTH_LABEL, nodeDepth, type NodeDepth } from "@/lib/nodes/depth";
import { cn } from "@/lib/utils";

interface MigrationRow {
  name: string;
  type: string;
  status: NodeDepth;
  displayName: string;
  reason?: string;
}

const STATUS_META: Record<
  NodeDepth,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  ready: {
    label: DEPTH_LABEL.ready,
    icon: CheckCircle2,
    className: "bg-[var(--success)]/12 text-[var(--success)]",
  },
  partial: {
    label: DEPTH_LABEL.partial,
    icon: CircleDashed,
    className: "bg-[var(--warning)]/12 text-[var(--warning)]",
  },
  stub: {
    label: DEPTH_LABEL.stub,
    icon: TriangleAlert,
    className: "bg-[var(--warning)]/12 text-[var(--warning)]",
  },
};

export function MigrationReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const rows = useMemo<MigrationRow[]>(
    () =>
      workflow.nodes.map((node) => {
        const desc = getNodeType(node.type);
        return {
          name: node.name,
          type: node.type,
          status: nodeDepth(node.type),
          displayName: desc.displayName,
          reason: getExecutorUnavailability(desc.name)?.reason,
        };
      }),
    [workflow],
  );
  const supported = rows.filter((r) => r.status === "ready").length;
  const total = rows.length;
  const pct = total ? Math.round((supported / total) * 100) : 100;

  const grouped = useMemo(() => {
    const map = new Map<string, { type: string; count: number; status: NodeDepth }>();
    for (const r of rows) {
      if (r.status === "ready") continue;
      const existing = map.get(r.type);
      if (existing) existing.count += 1;
      else map.set(r.type, { type: r.type, count: 1, status: r.status });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Migration report</DialogTitle>
          <DialogDescription>
            {supported} of {total} nodes ({pct}%) are ready to run in this build. Partial and stub
            nodes keep their parameters and export unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>

        {grouped.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Not-ready node types
            </p>
            <ul className="space-y-1">
              {grouped.map((g) => {
                const meta = STATUS_META[g.status];
                return (
                  <li
                    key={g.type}
                    className="flex items-center justify-between gap-2 text-[12px]"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <meta.icon className="size-3 shrink-0 text-[var(--warning)]" />
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {g.type}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground">{meta.label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        ×{g.count}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <ScrollArea className="max-h-[50vh]">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-popover">
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Node</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = STATUS_META[row.status];
                return (
                  <tr key={row.name} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      {row.name}
                      {row.reason && (
                        <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                          {row.reason}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                      {row.type}
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                          meta.className,
                        )}
                      >
                        <meta.icon className="size-3" />
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">
                    This workflow has no nodes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}