import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { apiFetch } from "@/lib/auth/client";

type WorkflowRow = {
  id: string;
  name: string;
  settings?: { executionTimeout?: number; maxConcurrency?: number };
};

type ExecutionRow = {
  id: string;
  workflowId: string;
  status: string;
  workflow?: { name?: string };
};

export function ExecutionGovernancePanel() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [live, setLive] = useState<ExecutionRow[]>([]);
  const [selected, setSelected] = useState("");
  const [timeoutSec, setTimeoutSec] = useState("");
  const [maxConc, setMaxConc] = useState("");
  const [msg, setMsg] = useState("");

  const refresh = async () => {
    const [wfRes, exRes] = await Promise.all([
      apiFetch("/api/v1/workflows"),
      apiFetch("/api/v1/executions?limit=20"),
    ]);
    if (wfRes.ok) {
      const body = (await wfRes.json()) as WorkflowRow[];
      const list = Array.isArray(body) ? body : [];
      setWorkflows(list);
      setSelected((prev) => prev || list[0]?.id || "");
    }
    if (exRes.ok) {
      const body = (await exRes.json()) as { executions?: ExecutionRow[] };
      setLive((body.executions ?? []).filter((e) => e.status === "running" || e.status === "waiting"));
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wf = workflows.find((w) => w.id === selected);
    setTimeoutSec(wf?.settings?.executionTimeout ? String(wf.settings.executionTimeout) : "");
    setMaxConc(wf?.settings?.maxConcurrency ? String(wf.settings.maxConcurrency) : "");
  }, [selected, workflows]);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Execution governance</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Per-workflow timeout (seconds), concurrency quota, and cancel. Timeouts persist as an
          error with code <code className="rounded bg-muted px-1">timeout</code>. Cancel sets status
          to <code className="rounded bg-muted px-1">cancelled</code>.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Workflow</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Timeout (s)</span>
          <input
            className="w-24 rounded-md border border-border bg-background px-2 py-1"
            value={timeoutSec}
            onChange={(e) => setTimeoutSec(e.target.value)}
            placeholder="off"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Max concurrent</span>
          <input
            className="w-24 rounded-md border border-border bg-background px-2 py-1"
            value={maxConc}
            onChange={(e) => setMaxConc(e.target.value)}
            placeholder="unlimited"
          />
        </label>
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
          onClick={() => {
            if (!selected) return;
            const executionTimeout = timeoutSec.trim() ? Number(timeoutSec) : null;
            const maxConcurrency = maxConc.trim() ? Number(maxConc) : null;
            void apiFetch(`/api/v1/workflows/${selected}/governance`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ executionTimeout, maxConcurrency }),
            }).then(async (res) => {
              setMsg(res.ok ? "Saved" : "Save failed");
              await refresh();
            });
          }}
        >
          Save
        </button>
      </div>
      {msg ? <p className="text-[12px] text-muted-foreground">{msg}</p> : null}
      <div>
        <h3 className="text-[13px] font-medium text-foreground">Live executions</h3>
        {live.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted-foreground">None running or waiting.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-[13px]">
            {live.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <Link to="/executions/$id" params={{ id: e.id }} className="truncate text-primary hover:underline">
                  {e.workflow?.name ?? e.workflowId} · {e.status}
                </Link>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-0.5 text-xs"
                  onClick={() => {
                    void apiFetch(`/api/v1/executions/${e.id}/cancel`, { method: "POST" }).then(() =>
                      refresh(),
                    );
                  }}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
