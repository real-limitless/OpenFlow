import { describe, expect, it } from "vitest";
import { EMPTY_WORKFLOW } from "../types";
import * as m from "../mutations";

describe("workflow mutations", () => {
  it("adds, connects, renames, and deletes nodes", () => {
    let wf = EMPTY_WORKFLOW("wf1");
    const a = m.addNode(wf, "n8n-nodes-base.manualTrigger", { x: 0, y: 0 });
    wf = a.workflow;
    expect(a.result.name).toBeTruthy();

    const b = m.addNode(wf, "n8n-nodes-base.httpRequest", { x: 240, y: 0 }, "HTTP");
    wf = b.workflow;
    expect(wf.nodes).toHaveLength(2);

    const c = m.connectNodes(wf, a.result.name, b.result.name);
    wf = c.workflow;
    expect(wf.connections[a.result.name]?.main?.[0]?.[0]?.node).toBe(b.result.name);

    const r = m.renameNode(wf, b.result.name, "Fetch");
    wf = r.workflow;
    expect(wf.nodes.some((n) => n.name === "Fetch")).toBe(true);
    expect(wf.connections[a.result.name]?.main?.[0]?.[0]?.node).toBe("Fetch");

    const d = m.deleteNode(wf, "Fetch");
    wf = d.workflow;
    expect(wf.nodes).toHaveLength(1);
    expect(wf.connections[a.result.name]?.main?.[0] ?? []).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ node: "Fetch" })]),
    );
  });

  it("merges parameters", () => {
    let wf = EMPTY_WORKFLOW("wf2");
    const a = m.addNode(wf, "n8n-nodes-base.httpRequest", { x: 0, y: 0 });
    wf = a.workflow;
    const u = m.updateParameters(wf, a.result.name, { url: "https://example.com" });
    wf = u.workflow;
    const node = wf.nodes.find((n) => n.name === a.result.name)!;
    expect(node.parameters.url).toBe("https://example.com");
  });
});
