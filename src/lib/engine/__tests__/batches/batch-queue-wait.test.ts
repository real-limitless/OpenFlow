import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.wait";

describe("batch-queue wait — n8n-nodes-base.wait", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Wait");
  });

  it("timeInterval amount=0 returns input items immediately", async () => {
    const out = await runNode(
      TYPE,
      { resume: "timeInterval", amount: 0, unit: "seconds" },
      [{ a: 1 }, { a: 2 }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ a: 1 });
    expect(out[0][1].json).toEqual({ a: 2 });
  });

  it("timeInterval amount=1 unit=seconds returns input items (short interval)", async () => {
    const start = Date.now();
    const out = await runNode(
      TYPE,
      { resume: "timeInterval", amount: 1, unit: "seconds" },
      [{ x: "hello" }],
    );
    const elapsed = Date.now() - start;
    expect(out[0][0].json).toEqual({ x: "hello" });
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  it("timeInterval with empty input returns a single empty item", async () => {
    const out = await runNode(
      TYPE,
      { resume: "timeInterval", amount: 0, unit: "seconds" },
      [],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("specificTime in the past returns input items immediately", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const out = await runNode(
      TYPE,
      { resume: "specificTime", dateTime: past },
      [{ k: "v" }],
    );
    expect(out[0][0].json).toEqual({ k: "v" });
  });

  it("webhook resume passes input items through without waiting", async () => {
    const start = Date.now();
    const out = await runNode(
      TYPE,
      { resume: "webhook" },
      [{ pass: "through" }],
    );
    const elapsed = Date.now() - start;
    expect(out[0][0].json).toEqual({ pass: "through" });
    expect(elapsed).toBeLessThan(1000);
  });

  it("runs end-to-end in a workflow and preserves input items", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Wait",
          type: TYPE,
          typeVersion: 1.1,
          parameters: { resume: "timeInterval", amount: 0, unit: "seconds" },
        }),
      ],
      { Start: { main: [[{ node: "Wait", type: "main", index: 0 }]] } },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Wait?.status).toBe("success");
    expect(result.runData.Wait?.items?.[0][0].json).toEqual({});
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.wait")).toBe(canonical);
  });
});