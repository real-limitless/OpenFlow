import { describe, expect, it } from "vitest";
import { parseWorkflowJson } from "../schema";
import { importCompatReport } from "../import-compat";

const mixed = {
  name: "Imported mix",
  nodes: [
    {
      name: "Start",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      name: "HTTP",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 1,
      position: [200, 0],
      parameters: {},
    },
    {
      name: "LDAP",
      type: "n8n-nodes-base.ldap",
      typeVersion: 1,
      position: [400, 0],
      parameters: {},
    },
    {
      name: "Mystery",
      type: "n8n-nodes-base.definitelyDoesNotExistXYZ",
      typeVersion: 1,
      position: [600, 0],
      parameters: { keep: true },
    },
  ],
  connections: {},
  active: false,
  settings: {},
};

describe("importCompatReport", () => {
  it("scores per-node ready/partial/stub after n8n JSON parse", () => {
    const parsed = parseWorkflowJson(mixed);
    expect(parsed.ok).toBe(true);
    const report = importCompatReport(parsed.workflow!);
    expect(report.score).toBe(50);
    expect(report.label).toBe("partial");
    expect(report.rows.find((r) => r.name === "HTTP")?.depth).toBe("ready");
    expect(report.rows.find((r) => r.name === "LDAP")?.depth).toBe("partial");
    expect(report.rows.find((r) => r.name === "Mystery")?.depth).toBe("stub");
    expect(report.stub).toContain("openflow-node-base.definitelyDoesNotExistXYZ");
  });

  it("keeps stub node parameters on the parsed workflow", () => {
    const parsed = parseWorkflowJson(mixed);
    const mystery = parsed.workflow!.nodes.find((n) => n.name === "Mystery");
    expect(mystery?.parameters).toEqual({ keep: true });
    expect(mystery?.type).toBe("openflow-node-base.definitelyDoesNotExistXYZ");
  });
});
