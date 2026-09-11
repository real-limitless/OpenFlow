import { describe, expect, it } from "vitest";
import { WaitPausedError, isWaitPausedError, workflowExecutionId } from "../wait-pause";
import { waitExecutor } from "../executors/wait";
import { createExecutionContext } from "@/sdk";
import { makeNode } from "../__tests__/helpers";

describe("durable wait", () => {
  it("pauses webhook resume when an execution id is present", async () => {
    const node = makeNode({
      name: "Wait",
      type: "n8n-nodes-base.wait",
      parameters: { resume: "webhook" },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "w", name: "w", active: true, nodes: [node], connections: {}, settings: {}, __executionId: "ex1" } as never,
      getNodeInputItems: () => [{ json: { a: 1 } }],
      continueOnFail: false,
    });
    await expect(waitExecutor(ctx, node)).rejects.toSatisfy((err: unknown) => {
      expect(isWaitPausedError(err)).toBe(true);
      expect((err as WaitPausedError).resume).toBe("webhook");
      return true;
    });
  });

  it("sleeps tiny intervals without pausing", async () => {
    const node = makeNode({
      name: "Wait",
      type: "n8n-nodes-base.wait",
      parameters: { resume: "timeInterval", amount: 0, unit: "seconds" },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "w", name: "w", active: true, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { a: 1 } }],
      continueOnFail: false,
    });
    const out = await waitExecutor(ctx, node);
    expect(out[0][0].json).toEqual({ a: 1 });
  });
});

describe("workflowExecutionId", () => {
  it("reads __executionId", () => {
    expect(workflowExecutionId({ __executionId: "ex" })).toBe("ex");
    expect(workflowExecutionId({})).toBeUndefined();
  });
});
