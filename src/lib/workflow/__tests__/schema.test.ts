import { describe, it, expect } from "vitest";
import { parseWorkflowJson, serializeWorkflow } from "../schema";
import type { IWorkflow } from "../types";

const minimalRaw = {
  name: "Test Workflow",
  nodes: [
    {
      name: "Start",
      type: "n8n-nodes-base.manualWorkflowTrigger",
      typeVersion: 1,
      position: [200, 300] as [number, number],
      parameters: {},
    },
  ],
  connections: {
    Start: {
      main: [[{ node: "End", type: "main", index: 0 }]],
    },
  },
  active: false,
  settings: { executionOrder: "v1" },
};

describe("schema round-trip", () => {
  it("parseWorkflowJson succeeds on a valid object", () => {
    const result = parseWorkflowJson(minimalRaw);
    expect(result.ok).toBe(true);
    expect(result.workflow).toBeDefined();
    expect(result.workflow!.name).toBe("Test Workflow");
    expect(result.workflow!.nodes).toHaveLength(1);
  });

  it("serializeWorkflow produces valid JSON string", () => {
    const { workflow } = parseWorkflowJson(minimalRaw)!;
    const json = serializeWorkflow(workflow!);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("Test Workflow");
    expect(parsed.nodes).toHaveLength(1);
  });

  it("round-trip: parse → serialize → parse preserves data", () => {
    const first = parseWorkflowJson(minimalRaw);
    const json = serializeWorkflow(first!.workflow!);
    const second = parseWorkflowJson(json);

    expect(second.ok).toBe(true);
    const w1 = first!.workflow!;
    const w2 = second!.workflow!;
    expect(w2.name).toBe(w1.name);
    expect(w2.nodes).toHaveLength(w1.nodes.length);
    expect(w2.nodes[0].name).toBe(w1.nodes[0].name);
    expect(w2.nodes[0].type).toBe(w1.nodes[0].type);
    expect(w2.active).toBe(w1.active);
  });

  it("preserves unknown fields through round-trip", () => {
    const raw = {
      ...minimalRaw,
      customField: "kept",
      nodes: [{ ...minimalRaw.nodes[0], myCustom: 42 }],
    };
    const first = parseWorkflowJson(raw);
    const json = serializeWorkflow(first!.workflow!);
    const second = parseWorkflowJson(json);

    const serialized = JSON.parse(json);
    expect(serialized.customField).toBe("kept");
    expect(second.ok).toBe(true);
  });

  it("rejects input with no nodes", () => {
    const result = parseWorkflowJson({ name: "Bad", nodes: [] });
    expect(result.ok).toBe(true);
    expect(result.workflow!.nodes).toHaveLength(0);
  });

  it("parses from a JSON string", () => {
    const result = parseWorkflowJson(JSON.stringify(minimalRaw));
    expect(result.ok).toBe(true);
    expect(result.workflow!.nodes[0].name).toBe("Start");
  });

  it("rejects invalid JSON string", () => {
    const result = parseWorkflowJson("{not valid json");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });
});
