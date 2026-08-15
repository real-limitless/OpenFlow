import { describe, expect, it } from "vitest";
import {
  specPathForType,
  toCanonicalType,
  toWireType,
  typeKeys,
  typesEqual,
} from "../type-ids";
import { parseWorkflowJson, serializeWorkflow } from "@/lib/workflow/schema";

describe("type-ids", () => {
  it("maps base package both ways", () => {
    expect(toCanonicalType("n8n-nodes-base.httpRequest")).toBe(
      "openflow-node-base.httpRequest",
    );
    expect(toWireType("openflow-node-base.httpRequest")).toBe("n8n-nodes-base.httpRequest");
    expect(toCanonicalType("nodes-base.set")).toBe("openflow-node-base.set");
  });

  it("maps langchain package both ways", () => {
    expect(toCanonicalType("@n8n/n8n-nodes-langchain.toolWikipedia")).toBe(
      "openflow-node-langchain.toolWikipedia",
    );
    expect(toWireType("openflow-node-langchain.agent")).toBe(
      "@n8n/n8n-nodes-langchain.agent",
    );
  });

  it("leaves native openflow.* types alone", () => {
    expect(toCanonicalType("openflow.inspectTable")).toBe("openflow.inspectTable");
    expect(toWireType("openflow.inspectMedia")).toBe("openflow.inspectMedia");
  });

  it("typesEqual across wire and canonical", () => {
    expect(typesEqual("n8n-nodes-base.webhook", "openflow-node-base.webhook")).toBe(true);
    expect(typesEqual("n8n-nodes-base.webhook", "n8n-nodes-base.set")).toBe(false);
  });

  it("typeKeys includes wire + canonical + legacy", () => {
    const keys = typeKeys("n8n-nodes-base.telegram");
    expect(keys).toContain("openflow-node-base.telegram");
    expect(keys).toContain("n8n-nodes-base.telegram");
    expect(keys).toContain("nodes-base.telegram");
  });

  it("specPathForType uses wire filenames", () => {
    expect(specPathForType("openflow-node-base.httpRequest")).toBe(
      "docs/specs/nodes/n8n-nodes-base.httpRequest.md",
    );
    expect(specPathForType("@n8n/n8n-nodes-langchain.agent")).toBe(
      "docs/specs/nodes/@n8n/n8n-nodes-langchain.agent.md",
    );
  });
});

describe("workflow type normalize on import/export", () => {
  it("normalizes wire types to canonical on parse", () => {
    const result = parseWorkflowJson({
      name: "t",
      nodes: [
        {
          name: "HTTP",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {},
    });
    expect(result.ok).toBe(true);
    expect(result.workflow!.nodes[0]!.type).toBe("openflow-node-base.httpRequest");
  });

  it("export openflow keeps canonical; n8n mode rewrites wire", () => {
    const { workflow } = parseWorkflowJson({
      name: "t",
      nodes: [
        {
          name: "HTTP",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {},
    });
    const of = JSON.parse(serializeWorkflow(workflow!, { mode: "openflow" }));
    const n8n = JSON.parse(serializeWorkflow(workflow!, { mode: "n8n" }));
    expect(of.nodes[0].type).toBe("openflow-node-base.httpRequest");
    expect(n8n.nodes[0].type).toBe("n8n-nodes-base.httpRequest");
  });
});
