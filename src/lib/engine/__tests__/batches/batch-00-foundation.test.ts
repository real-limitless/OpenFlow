import { describe, it, expect } from "vitest";
import {
  getExecutorMap,
  listExecutorTypes,
  registerExecutor,
  hasExecutor,
  seedBuiltinExecutors,
} from "../../index";
import { getNodeType, allNodeTypes, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeCtx, makeNode, runNode, runWorkflowFixture, makeWorkflow } from "../helpers";
import type { NodeExecutor } from "@/sdk";

describe("batch-00 foundation — live registry", () => {
  it("seeds builtin executors", () => {
    seedBuiltinExecutors();
    const types = listExecutorTypes();
    expect(types.length).toBeGreaterThanOrEqual(18);
    expect(hasExecutor("n8n-nodes-base.set")).toBe(true);
    expect(hasExecutor("n8n-nodes-base.manualTrigger")).toBe(true);
  });

  it("getExecutorMap returns a plain object usable by the runner", () => {
    const map = getExecutorMap();
    expect(typeof map["n8n-nodes-base.noOp"]).toBe("function");
    expect(Object.keys(map).some((k) => k.startsWith("n8n-nodes-base."))).toBe(true);
  });

  it("registerExecutor hot-adds a type without restart", async () => {
    const type = "openflow.test.hotLoad";
    const exec: NodeExecutor = async () => [[{ json: { hot: true } }]];
    registerExecutor(type, exec);
    expect(hasExecutor(type)).toBe(true);

    const out = await runNode(type, {}, [{ x: 1 }]);
    expect(out[0][0].json.hot).toBe(true);
  });

  it("descriptions are registered for builtins", () => {
    seedBuiltinDescriptions();
    const set = getNodeType("n8n-nodes-base.set");
    expect(set.placeholder).not.toBe(true);
    expect(set.displayName.length).toBeGreaterThan(0);
    expect(allNodeTypes().length).toBeGreaterThanOrEqual(20);
  });

  it("helpers run a minimal workflow end-to-end", async () => {
    const workflow = makeWorkflow(
      [
        makeNode({
          id: "1",
          name: "Start",
          type: "n8n-nodes-base.manualTrigger",
        }),
        makeNode({
          id: "2",
          name: "Pass",
          type: "n8n-nodes-base.noOp",
        }),
      ],
      {
        Start: {
          main: [[{ node: "Pass", type: "main", index: 0 }]],
        },
      },
    );

    const result = await runWorkflowFixture(workflow);
    expect(result.success).toBe(true);
    expect(result.runData.Pass?.status).toBe("success");
  });

  it("makeCtx provides getInputItems", async () => {
    const node = makeNode({ name: "T", type: "n8n-nodes-base.noOp" });
    const ctx = makeCtx([{ a: 1 }], node);
    expect(ctx.getInputItems(0)[0].json.a).toBe(1);
    expect(ctx.getParam("missing", "x")).toBe("x");
  });
});
