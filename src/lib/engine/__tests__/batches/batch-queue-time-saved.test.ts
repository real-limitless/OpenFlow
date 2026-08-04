import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx, makeNode, makeWorkflow, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.timeSaved";

describe("batch-queue time-saved — n8n-nodes-base.timeSaved", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Track Time Saved");
  });

  it("records minutes saved once for all items (acceptance: basic once-mode)", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      { mode: "once", minutesSaved: 10 },
      [{ id: 1 }, { id: 2 }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ id: 1 });
    expect(out[0][1].json).toEqual({ id: 2 });
    expect(ctx.getCustomData("timeSaved")).toBe("10");
  });

  it("multiplies by item count in perItem mode (acceptance: per-item mode)", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      { mode: "perItem", minutesSaved: 5 },
      [{}, {}, {}],
    );
    expect(out[0]).toHaveLength(3);
    expect(ctx.getCustomData("timeSaved")).toBe("15");
  });

  it("contributes nothing when minutes is 0 (acceptance: zero minutes)", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      { mode: "once", minutesSaved: 0 },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(ctx.getCustomData("timeSaved")).toBe("0");
  });

  it("records 0 on empty input in perItem mode (acceptance: no input items)", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      { mode: "perItem", minutesSaved: 10 },
      [],
    );
    expect(out[0]).toHaveLength(0);
    expect(ctx.getCustomData("timeSaved")).toBe("0");
  });

  it("runs end-to-end through a workflow with two timeSaved nodes (accumulation)", async () => {
    const { makeWorkflow, runWorkflowFixture } = await import("../helpers");
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "TS1",
          type: TYPE,
          parameters: { mode: "once", minutesSaved: 10 },
        }),
        makeNode({
          id: "3",
          name: "TS2",
          type: TYPE,
          parameters: { mode: "once", minutesSaved: 5 },
        }),
      ],
      {
        Start: { main: [[{ node: "TS1", type: "main", index: 0 }]] },
        TS1: { main: [[{ node: "TS2", type: "main", index: 0 }]] },
      },
    );
    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.TS1?.status).toBe("success");
    expect(result.runData.TS2?.status).toBe("success");
  });

  it("resolves the same executor under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.timeSaved")).toBe(canonical);
  });
});
