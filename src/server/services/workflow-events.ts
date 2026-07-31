import type { IWorkflow } from "../../lib/workflow/types";

export type WorkflowEvent =
  | { type: "workflow.updated"; workflowId: string; workflow: IWorkflow; source: string }
  | { type: "node.selected"; workflowId: string; nodeName: string | null }
  | { type: "execution.started"; workflowId: string; executionId: string }
  | { type: "execution.finished"; workflowId: string; executionId: string; status: string };

type Listener = (event: WorkflowEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeWorkflowEvents(workflowId: string, listener: Listener): () => void {
  let set = listeners.get(workflowId);
  if (!set) {
    set = new Set();
    listeners.set(workflowId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(workflowId);
  };
}

export function emitWorkflowEvent(event: WorkflowEvent): void {
  const set = listeners.get(event.workflowId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (err) {
      console.error("[workflow-events] listener error", err);
    }
  }
}
