import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DockviewApi } from "dockview";
import { Toaster } from "@/components/ui/sonner";
import { getRepository } from "@/lib/storage/repository";
import { useWorkflowStore } from "@/store/workflow-store";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { EditorDockHost } from "@/components/editor/dock/EditorDockHost";
import { ExecuteTriggerButton } from "@/components/editor/ExecuteTriggerButton";
import type { ExecutionRunData } from "@/lib/engine/types";
import type { IWorkflow } from "@/lib/workflow/types";
import {
  consumeOnboardingBanner,
  loadOnboardingState,
  patchOnboardingState,
} from "@/lib/onboarding/state";

export const Route = createFileRoute("/workflow/$id")({
  head: () => ({
    meta: [
      { title: "Workflow editor — OpenFlow" },
      {
        name: "description",
        content:
          "Edit workflow nodes, connections and parameters on a React Flow canvas with live expression previews.",
      },
      { property: "og:title", content: "Workflow editor — OpenFlow" },
      {
        property: "og:description",
        content: "Visual workflow editing with schema-driven parameter forms and JSON round-trip.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const { id } = Route.useParams();
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false);
  const load = useWorkflowStore((s) => s.load);
  const applyRemote = useWorkflowStore((s) => s.applyRemote);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const workflow = useWorkflowStore((s) => s.workflow);
  const dirty = useWorkflowStore((s) => s.dirty);
  const persist = useWorkflowStore((s) => s.persist);
  const addNode = useWorkflowStore((s) => s.addNode);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [isExecuting, setIsExecuting] = useState(false);
  const [runData, setRunData] = useState<ExecutionRunData | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const dockApiRef = useRef<DockviewApi | null>(null);

  const bumpHistory = () => setHistoryKey((k) => k + 1);

  useEffect(() => {
    if (consumeOnboardingBanner()) {
      setShowOnboardingBanner(true);
    }
  }, [id]);

  const markFirstRunSuccess = () => {
    const ob = loadOnboardingState();
    if (ob.dismissed || ob.firstRunSuccess) return;
    // Only celebrate the sample / coached first-run path, not every execute
    if (!ob.sampleCreated && !showOnboardingBanner) return;
    patchOnboardingState({ firstRunSuccess: true, sampleCreated: true });
    toast.success("First run complete", {
      description: "You’re set — keep editing or start a new workflow from home.",
    });
    setShowOnboardingBanner(false);
  };

  const handleExecute = async (
    startNode?: string,
    opts?: { executePreviousOf?: string },
  ) => {
    setIsExecuting(true);
    setRunData(null);
    bumpHistory();
    try {
      // Always persist before execute so DB has latest graph + ids for sub-workflows
      try {
        await useWorkflowStore.getState().persist();
      } catch (err) {
        console.error("Persist before execute failed:", err);
        toast.error("Could not save workflow to the database before execute", {
          description: err instanceof Error ? err.message : undefined,
        });
        setIsExecuting(false);
        return;
      }
      const latest = useWorkflowStore.getState().workflow;
      const execId = latest.id || id;
      const { projectHeaders } = await import("@/lib/projects/client");
      const { getSelectedEnvironmentId } = await import("@/lib/environments/client");
      const res = await fetch(`/api/v1/workflows/${execId}/execute`, {
        method: "POST",
        credentials: "include",
        headers: projectHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          workflow: latest,
          environmentId: getSelectedEnvironmentId() ?? undefined,
          startNode: startNode || undefined,
          executePreviousOf: opts?.executePreviousOf || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to start execution");
      const { executionId } = await res.json();
      bumpHistory();
      const sse = new EventSource(`/api/v1/executions/${executionId}/stream`);
      eventSourceRef.current = sse;
      sse.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "complete") {
          if (data.data) setRunData(data.data as ExecutionRunData);
          if (data.status === "error") {
            toast.error("Execution failed", {
              description: "One or more nodes errored. See Execution data for details.",
            });
          } else {
            markFirstRunSuccess();
          }
          setIsExecuting(false);
          bumpHistory();
          sse.close();
        } else if (data.type === "error") {
          if (data.data) setRunData(data.data as ExecutionRunData);
          toast.error("Execution failed", {
            description: typeof data.message === "string" ? data.message : undefined,
          });
          setIsExecuting(false);
          bumpHistory();
          sse.close();
        } else if (data.type === "timeout") {
          toast.error("Execution timed out");
          setIsExecuting(false);
          bumpHistory();
          sse.close();
        } else if (data.type === "status") {
          if (data.runData && typeof data.runData === "object") {
            setRunData(data.runData as ExecutionRunData);
          }
          if (data.status === "running") bumpHistory();
        }
      };
      sse.onerror = () => {
        toast.error("Execution stream failed");
        setIsExecuting(false);
        bumpHistory();
        sse.close();
      };
    } catch (err) {
      console.error("Execute failed:", err);
      toast.error("Execution failed");
      setIsExecuting(false);
      bumpHistory();
    }
  };

  useEffect(() => {
    let cancelled = false;
    void getRepository()
      .get(id)
      .then((wf) => {
        if (cancelled) return;
        if (!wf) {
          setStatus("missing");
          return;
        }
        load(wf);
        setStatus("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [id, load]);

  // Debounced autosave (skip while assistant may be mutating remotely — still ok;
  // applyRemote clears dirty so we only save user edits).
  useEffect(() => {
    if (status !== "ready" || !dirty) return;
    const t = setTimeout(() => void persist(), 800);
    return () => clearTimeout(t);
  }, [workflow, dirty, status, persist]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void persist();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [persist]);

  useEffect(() => {
    if (dirty) setRunData(null);
  }, [dirty]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Live graph updates from assistant / remote mutations
  useEffect(() => {
    if (status !== "ready") return;
    const sse = new EventSource(`/api/v1/workflows/${id}/events`);
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          workflow?: IWorkflow;
          source?: string;
          nodeName?: string | null;
        };
        if (data.type === "workflow.updated" && data.workflow && data.source !== "editor") {
          // Prefer remote assistant snapshot; drop local dirty to avoid thrash
          applyRemote(data.workflow);
        }
        if (data.type === "node.selected") {
          selectNode(data.nodeName ?? null);
        }
      } catch {
        /* ignore */
      }
    };
    return () => sse.close();
  }, [id, status, applyRemote, selectNode]);

  if (status === "missing") {
    throw notFound();
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <EditorTopBar
        dockApiRef={dockApiRef}
        actions={
          <ExecuteTriggerButton
            workflow={workflow}
            isExecuting={isExecuting}
            onExecute={(startNode) => void handleExecute(startNode)}
          />
        }
      />
      {showOnboardingBanner && status === "ready" && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-[13px]">
          <p className="text-foreground">
            <span className="font-medium">First run:</span> click{" "}
            <strong>Execute</strong> to run this sample (public GitHub API, no credentials).
          </p>
          <button
            type="button"
            className="text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowOnboardingBanner(false)}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        {status === "ready" ? (
          <EditorDockHost
            workflowId={id}
            runData={runData}
            historyKey={historyKey}
            isExecuting={isExecuting}
            onExecutePrevious={(nodeName) =>
              void handleExecute(undefined, { executePreviousOf: nodeName })
            }
            onAddNode={(type) =>
              addNode(type, {
                x: 120 + workflow.nodes.length * 40,
                y: 120 + (workflow.nodes.length % 4) * 40,
              })
            }
            onSelectExecution={(rd) => setRunData(rd)}
            dockApiRef={dockApiRef}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading workflow…
          </div>
        )}
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
