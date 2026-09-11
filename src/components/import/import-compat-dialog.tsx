import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DepthBadge } from "@/components/nodes/depth-badge";
import { importCompatReport } from "@/lib/workflow/import-compat";
import type { IWorkflow } from "@/lib/workflow/types";
import { DEPTH_LABEL } from "@/lib/nodes/depth";

export function ImportCompatDialog({
  open,
  workflow,
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  workflow: IWorkflow | null;
  onOpenChange: (open: boolean) => void;
  onContinue: (workflow: IWorkflow) => void;
}) {
  const report = useMemo(
    () => (workflow ? importCompatReport(workflow) : null),
    [workflow],
  );

  if (!workflow || !report) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="import-compat-dialog">
        <DialogHeader>
          <DialogTitle>Import report</DialogTitle>
          <DialogDescription>
            {report.score}% of scored nodes are ready to run. Stub types stay on
            the canvas as non-executable placeholders and keep their parameters.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-semibold tabular-nums">{report.score}%</span>
          <span className="text-muted-foreground">{DEPTH_LABEL[report.label]}</span>
          <span className="text-muted-foreground">
            {report.ready.length} ready · {report.partial.length} partial · {report.stub.length}{" "}
            stub
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${report.score}%` }} />
        </div>

        <ScrollArea className="max-h-[50vh]">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-popover">
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Node</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 font-medium">Depth</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={`${row.name}-${row.type}`} className="border-b border-border/60">
                  <td className="py-2 pr-3">{row.name}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                    {row.type}
                  </td>
                  <td className="py-2">
                    <DepthBadge depth={row.depth} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>

        {report.stub.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {report.stub.length} stub type{report.stub.length === 1 ? "" : "s"} will not execute.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onContinue(workflow)}>Continue import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
