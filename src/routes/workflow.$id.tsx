import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { getRepository } from "@/lib/storage/repository";
import { useWorkflowStore } from "@/store/workflow-store";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { NodePalette } from "@/components/editor/NodePalette";
import { WorkflowCanvas } from "@/components/editor/WorkflowCanvas";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { DataPanel } from "@/components/editor/DataPanel";
import { ExecutionHistory } from "@/components/editor/ExecutionHistory";
import type { ExecutionRunData } from "@/lib/engine/types";

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
  const load = useWorkflowStore((s) => s.load);
  const workflow = useWorkflowStore((s) => s.workflow);
  const dirty = useWorkflowStore((s) => s.dirty);
  const persist = useWorkflowStore((s) => s.persist);
  const addNode = useWorkflowStore((s) => s.addNode);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [isExecuting, setIsExecuting] = useState(false);
  const [runData, setRunData] = useState<ExecutionRunData | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const bumpHistory = () => setHistoryKey((k) => k + 1);

  const handleExecute = async () => {
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
      const res = await fetch(`/api/v1/workflows/${execId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: latest }),
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
              description: "One or more nodes errored. See the data panel for details.",
            });
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

  // Debounced autosave.
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

  if (status === "missing") {
    throw notFound();
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <EditorTopBar
        actions={
          <Button
            variant="default"
            size="sm"
            className="h-8 text-[12px]"
            onClick={handleExecute}
            disabled={isExecuting}
          >
            <Play className="mr-1 size-3.5" />
            {isExecuting ? "Running\u2026" : "Execute"}
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1">
        <NodePalette
          onAdd={(type) =>
            addNode(type, {
              x: 120 + workflow.nodes.length * 40,
              y: 120 + (workflow.nodes.length % 4) * 40,
            })
          }
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
            <ResizablePanel defaultSize={70} minSize={10} className="min-h-0">
              <WorkflowCanvas runData={runData} />
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border" />
            <ResizablePanel defaultSize={30} minSize={8} className="min-h-0">
              <div className="flex h-full min-h-0 border-t border-border">
                <div className="min-h-0 min-w-0 flex-1">
                  <DataPanel runData={runData} />
                </div>
                <div className="flex h-full min-h-0 w-64 shrink-0 flex-col border-l border-border bg-sidebar">
                  <ExecutionHistory
                    workflowId={id}
                    refreshKey={historyKey}
                    onSelectExecution={(rd) => setRunData(rd as ExecutionRunData)}
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <PropertiesPanel />
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
