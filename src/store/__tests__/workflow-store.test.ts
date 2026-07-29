import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "../workflow-store";
import { toFlowEdges } from "../../lib/workflow/graph";

beforeEach(() => {
  useWorkflowStore.getState().reset();
});

describe("Workflow Store - Undo Coalesce", () => {
  it("coalesces rapid parameter updates into one undo entry", () => {
    const { addNode, updateParameters, undo } = useWorkflowStore.getState();

    const name = addNode("n8n-nodes-base.set", { x: 0, y: 0 });

    updateParameters(name, { value: "a" });
    updateParameters(name, { value: "ab" });
    updateParameters(name, { value: "abc" });
    updateParameters(name, { value: "abcd" });

    // Four rapid updates share one history entry: past = [empty, after-addNode]
    expect(useWorkflowStore.getState().past).toHaveLength(2);

    undo();

    const node = useWorkflowStore.getState().workflow.nodes.find((n) => n.name === name);
    // A single undo reverts the whole burst back to default parameters
    expect(node?.parameters.value).toBeUndefined();
  });

  it("structural edits push immediate history", () => {
    const { addNode, undo } = useWorkflowStore.getState();

    addNode("n8n-nodes-base.set", { x: 0, y: 0 });
    addNode("n8n-nodes-base.noOp", { x: 200, y: 0 });

    undo();

    expect(useWorkflowStore.getState().workflow.nodes).toHaveLength(1);
  });
});

describe("Workflow Store - insertNodeOnEdge", () => {
  it("inserts a node between two connected nodes", () => {
    const { addNode, connect, insertNodeOnEdge } = useWorkflowStore.getState();

    const source = addNode("n8n-nodes-base.manualTrigger", { x: 0, y: 0 });
    const target = addNode("n8n-nodes-base.set", { x: 200, y: 0 });
    connect(source, "main-0", target, "main-0");

    const before = toFlowEdges(useWorkflowStore.getState().workflow);
    expect(before).toHaveLength(1);

    insertNodeOnEdge(before[0].id, "n8n-nodes-base.noOp");

    const { workflow } = useWorkflowStore.getState();
    expect(workflow.nodes).toHaveLength(3);

    const insertedName = workflow.nodes.find((n) => n.name !== source && n.name !== target)?.name;
    expect(insertedName).toBeDefined();

    const inserted = workflow.nodes.find((n) => n.name === insertedName);
    expect(inserted?.type).toBe("n8n-nodes-base.noOp");
    expect(inserted?.position).toEqual([100, 0]);

    const edges = toFlowEdges(workflow);
    expect(edges).toHaveLength(2);
    expect(edges[0].source).toBe(source);
    expect(edges[0].target).toBe(insertedName);
    expect(edges[1].source).toBe(insertedName);
    expect(edges[1].target).toBe(target);
  });
});
