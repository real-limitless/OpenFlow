import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/auth/client";
import { useWorkflowStore } from "@/store/workflow-store";
import type { IWorkflow } from "@/lib/workflow/types";
import type { WorkflowVersionDiff } from "@/lib/workflow/versions";

type VersionRow = {
  id: string;
  versionId: string;
  name: string;
  createdAt: string;
  createdBy: string;
};

export function VersionHistoryDialog({
  open,
  workflowId,
  onClose,
}: {
  open: boolean;
  workflowId: string;
  onClose: () => void;
}) {
  const load = useWorkflowStore((s) => s.load);
  const [rows, setRows] = useState<VersionRow[]>([]);
  const [diff, setDiff] = useState<WorkflowVersionDiff | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void apiFetch(`/api/v1/workflows/${workflowId}/versions`).then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as { versions?: VersionRow[] };
      setRows(body.versions ?? []);
      setDiff(null);
    });
  }, [open, workflowId]);

  const restore = async (id: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/workflows/${workflowId}/versions/${id}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Restore failed");
        return;
      }
      const wf = (await res.json()) as IWorkflow;
      load(wf);
      toast.success("Restored version");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const showDiff = async (fromId: string, toId: string) => {
    const res = await apiFetch(`/api/v1/workflows/${workflowId}/versions/${fromId}/diff/${toId}`);
    if (!res.ok) return;
    setDiff((await res.json()) as WorkflowVersionDiff);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[80vh] max-w-lg overflow-auto">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No snapshots yet. Save the workflow to create one.
          </p>
        ) : (
          <ul className="space-y-2 text-[13px]">
            {rows.map((row, i) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-2 border-b border-border/60 pb-2"
              >
                <div>
                  <p className="font-medium text-foreground">{row.name}</p>
                  <p className="text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  {i < rows.length - 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void showDiff(rows[i + 1]!.id, row.id)}
                    >
                      Diff
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void restore(row.id)}
                  >
                    Restore
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {diff && (
          <div className="mt-3 rounded-md bg-muted p-3 text-[12px]">
            <p>
              {diff.fromName} → {diff.toName}
              {diff.nameChanged ? " (renamed)" : ""}
            </p>
            <p>
              Added {diff.nodesAdded.length} · removed {diff.nodesRemoved.length} · changed{" "}
              {diff.nodesChanged.length}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
