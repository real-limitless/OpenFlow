import { describe, it, expect, beforeEach } from "vitest";
import {
  emitWorkflowEvent,
  notifyExecutionFinished,
  notifyExecutionStarted,
  subscribeWorkflowEvents,
  type WorkflowEvent,
} from "../services/workflow-events";

describe("workflow execution events", () => {
  beforeEach(() => {
    // drain any leftover listeners by unsubscribing via subscribe return
  });

  it("delivers execution.started and execution.finished to subscribers", () => {
    const seen: WorkflowEvent[] = [];
    const unsub = subscribeWorkflowEvents("wf-1", (e) => seen.push(e));

    notifyExecutionStarted("wf-1", "ex-1", "webhook");
    notifyExecutionFinished("wf-1", "ex-1", "success", "webhook");
    notifyExecutionStarted("wf-other", "ex-2", "manual"); // different workflow

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      type: "execution.started",
      workflowId: "wf-1",
      executionId: "ex-1",
      mode: "webhook",
    });
    expect(seen[1]).toMatchObject({
      type: "execution.finished",
      workflowId: "wf-1",
      executionId: "ex-1",
      status: "success",
      mode: "webhook",
    });

    unsub();
    emitWorkflowEvent({
      type: "execution.started",
      workflowId: "wf-1",
      executionId: "ex-3",
    });
    expect(seen).toHaveLength(2);
  });

  it("isolates listeners per workflow id", () => {
    const a: WorkflowEvent[] = [];
    const b: WorkflowEvent[] = [];
    const ua = subscribeWorkflowEvents("A", (e) => a.push(e));
    const ub = subscribeWorkflowEvents("B", (e) => b.push(e));

    notifyExecutionStarted("A", "1");
    notifyExecutionFinished("B", "2", "error");

    expect(a).toHaveLength(1);
    expect(a[0]?.type).toBe("execution.started");
    expect(b).toHaveLength(1);
    expect(b[0]?.type).toBe("execution.finished");

    ua();
    ub();
  });
});
