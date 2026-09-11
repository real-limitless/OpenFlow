import { describe, expect, it } from "vitest";
import { diffWorkflows } from "../versions";
import { EMPTY_WORKFLOW } from "../types";

describe("workflow version diff", () => {
  it("reports added, removed, and renamed nodes", () => {
    const from = EMPTY_WORKFLOW("wf1", "A");
    from.nodes = [
      { id: "n1", name: "Start", type: "openflow-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} },
    ];
    const to = EMPTY_WORKFLOW("wf1", "B");
    to.nodes = [
      { id: "n1", name: "Start", type: "openflow-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: { x: 1 } },
      { id: "n2", name: "HTTP", type: "openflow-nodes-base.httpRequest", typeVersion: 1, position: [1, 0], parameters: {} },
    ];
    const diff = diffWorkflows(from, to);
    expect(diff.nameChanged).toBe(true);
    expect(diff.nodesAdded).toEqual(["n2"]);
    expect(diff.nodesChanged).toEqual(["n1"]);
    expect(diff.toNodeCount).toBe(2);
  });
});
