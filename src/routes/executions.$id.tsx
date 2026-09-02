import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ExecutionRunData } from "@/lib/engine/types";
import { openExecutionStream } from "@/lib/editor/execution-stream";
import { AgentTraceBlock, extractAgentView } from "@/components/editor/execution/AgentTraceView";
import { buildExecutionEntries } from "@/components/editor/execution/use-execution-entries";

export const Route = createFileRoute("/executions/$id")({
  head: () => ({
    meta: [
      { title: "Execution — OpenFlow" },
      { name: "description", content: "Live and historical workflow execution detail." },
    ],
  }),
  component: ExecutionDetailPage,
});

type ExecutionRow = {
  id: string;
  workflowId: string;
  status: string;
  mode: string;
  startedAt?: string;
  finishedAt?: string | null;
  runData?: string | ExecutionRunData;
  error?: string | null;
  meta?: string | null;
  workflow?: { id: string; name: string };
};

function parseRunData(raw: ExecutionRow["runData"]): ExecutionRunData {
  if (raw && typeof raw === "object") return raw as ExecutionRunData;
  if (typeof raw === "string" && raw) {
    try {
      return JSON.parse(raw) as ExecutionRunData;
    } catch {
      return {};
    }
  }
  return {};
}

function parseMeta(raw: unknown): Record<string, string> {
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  if (typeof raw === "string" && raw) {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
}

function ExecutionDetailPage() {
  const { id } = Route.useParams();
  const [row, setRow] = useState<ExecutionRow | null | undefined>(undefined);
  const [runData, setRunData] = useState<ExecutionRunData>({});

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/v1/executions/${id}`, { credentials: "include" })
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("Failed to load execution");
        return (await res.json()) as ExecutionRow;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setRow(null);
          return;
        }
        setRow(data);
        setRunData(parseRunData(data.runData));
      })
      .catch(() => {
        if (!cancelled) setRow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const live = row != null && (row.status === "running" || row.status === "waiting");

  useEffect(() => {
    if (!live) return;
    const sse = openExecutionStream(id, {
      onStatus: (payload) => {
        if (payload.runData) setRunData(payload.runData);
        setRow((prev) => (prev ? { ...prev, status: payload.status } : prev));
      },
      onComplete: (payload) => {
        if (payload.data) setRunData(payload.data);
        setRow((prev) => (prev ? { ...prev, status: payload.status } : prev));
      },
    });
    return () => sse.close();
  }, [id, live]);

  if (row === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading execution…
      </div>
    );
  }

  if (row === null) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Execution not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This History link may be from another project, or the run was deleted.
          </p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const meta = parseMeta(row.meta);
  const entries = buildExecutionEntries(runData);
  const error =
    typeof row.error === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(row.error) as { message?: string };
            return parsed.message ?? row.error;
          } catch {
            return row.error;
          }
        })()
      : null;

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/workflow/$id"
            params={{ id: row.workflowId }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {row.workflow?.name ?? "Workflow"}
          </Link>
          <Badge
            variant={
              row.status === "success"
                ? "default"
                : row.status === "error"
                  ? "destructive"
                  : "secondary"
            }
          >
            {row.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{row.mode}</span>
        </div>
        <h1 className="font-mono text-sm text-muted-foreground">{row.id}</h1>
        {(meta.host || meta.stageId || meta.projectId || meta.fingerprint) && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {meta.host && (
              <>
                <dt className="text-muted-foreground">Host</dt>
                <dd>{meta.host}</dd>
              </>
            )}
            {meta.stageId && (
              <>
                <dt className="text-muted-foreground">Stage</dt>
                <dd>{meta.stageId}</dd>
              </>
            )}
            {meta.projectId && (
              <>
                <dt className="text-muted-foreground">Project</dt>
                <dd className="truncate">{meta.projectId}</dd>
              </>
            )}
            {meta.fingerprint && (
              <>
                <dt className="text-muted-foreground">Fingerprint</dt>
                <dd className="truncate font-mono">{meta.fingerprint}</dd>
              </>
            )}
          </dl>
        )}
        {error && (
          <pre className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[12px] text-destructive">
            {error}
          </pre>
        )}
        <div className="space-y-3">
          {entries.map((entry) => {
            const nodeData = runData[entry.name];
            const view = extractAgentView(nodeData);
            const hasTrace =
              !!view.trace || !!view.progress || (view.intermediateSteps?.length ?? 0) > 0;
            return (
              <section key={entry.name} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <span className="font-medium">{entry.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {entry.status}
                  </Badge>
                </div>
                {hasTrace ? (
                  <AgentTraceBlock source={nodeData} />
                ) : (
                  <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
                    {JSON.stringify(nodeData ?? {}, null, 2)}
                  </pre>
                )}
              </section>
            );
          })}
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {row.status === "running" ? "Waiting for run data…" : "No run data"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
