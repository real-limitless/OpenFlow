import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { apiFetch } from "@/lib/auth/client";

type DlqRow = {
  id: string;
  workflowId: string;
  workflowName: string;
  failedNode: string | null;
  failedMessage: string | null;
  startedAt: string;
};

export function DlqPanel() {
  const [rows, setRows] = useState<DlqRow[] | null>(null);

  const refresh = async () => {
    const res = await apiFetch("/api/v1/executions/dlq?limit=20");
    if (!res.ok) return;
    const body = (await res.json()) as { executions?: DlqRow[] };
    setRows(body.executions ?? []);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Dead-letter queue</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Failed executions. Replay starts at the failed node (
          <code className="rounded bg-muted px-1">destinationNode</code>
          ). Set <code className="rounded bg-muted px-1">settings.errorWorkflow</code> to run an
          Error Trigger workflow on failure.
        </p>
      </div>
      {rows == null ? (
        <p className="text-[13px] text-muted-foreground">Loading DLQ…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No failed executions.</p>
      ) : (
        <ul className="space-y-2 text-[13px]">
          {rows.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
              <div className="min-w-0">
                <Link to="/executions/$id" params={{ id: e.id }} className="text-primary hover:underline">
                  {e.workflowName}
                </Link>
                <p className="truncate text-muted-foreground">
                  {e.failedNode ?? "unknown node"}
                  {e.failedMessage ? ` — ${e.failedMessage}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs"
                onClick={() => {
                  void apiFetch(`/api/v1/executions/${e.id}/replay`, { method: "POST" }).then(async (res) => {
                    if (!res.ok) return;
                    const body = (await res.json()) as { executionId?: string };
                    if (body.executionId) window.location.href = `/executions/${body.executionId}`;
                    else void refresh();
                  });
                }}
              >
                Replay
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
