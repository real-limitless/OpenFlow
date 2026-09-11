import { describe, expect, it } from "vitest";
import { nodeDepth, scoreNodeTypes } from "../depth";

describe("nodeDepth", () => {
  it("marks a builtin HTTP executor as ready", () => {
    expect(nodeDepth("openflow-node-base.httpRequest")).toBe("ready");
    expect(nodeDepth("n8n-nodes-base.httpRequest")).toBe("ready");
  });

  it("marks unwired transport executors as partial, not ready", () => {
    expect(nodeDepth("n8n-nodes-base.ldap")).toBe("partial");
    expect(nodeDepth("n8n-nodes-base.emailReadImap")).toBe("partial");
  });

  it("marks unknown types as stubs", () => {
    expect(nodeDepth("n8n-nodes-base.definitelyDoesNotExistXYZ")).toBe("stub");
  });

  it("treats sticky notes as canvas-only ready", () => {
    expect(nodeDepth("n8n-nodes-base.stickyNote")).toBe("ready");
  });
});

describe("scoreNodeTypes", () => {
  it("scores 100 when only canvas types are present", () => {
    const r = scoreNodeTypes(["n8n-nodes-base.stickyNote"]);
    expect(r.total).toBe(0);
    expect(r.score).toBe(100);
    expect(r.label).toBe("ready");
  });

  it("scores a mix of ready and unknown as partial", () => {
    const r = scoreNodeTypes([
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.definitelyDoesNotExistXYZ",
    ]);
    expect(r.label).toBe("partial");
    expect(r.ready).toContain("n8n-nodes-base.httpRequest");
    expect(r.stub).toContain("n8n-nodes-base.definitelyDoesNotExistXYZ");
    expect(r.score).toBe(50);
  });

  it("scores unknown-only lists as stub", () => {
    const r = scoreNodeTypes(["n8n-nodes-base.definitelyDoesNotExistXYZ"]);
    expect(r.label).toBe("stub");
    expect(r.score).toBe(0);
  });

  it("scores unwired executors as partial", () => {
    const r = scoreNodeTypes(["n8n-nodes-base.ldap"]);
    expect(r.label).toBe("partial");
    expect(r.partial).toContain("n8n-nodes-base.ldap");
  });
});
