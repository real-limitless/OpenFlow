import { describe, it, expect } from "vitest";
import { executeWorkflow } from "../../runner";
import { getExecutorMap, seedBuiltinExecutors } from "../../index";
import { loadDogfoodFixture } from "./load-fixture";

describe("dogfood WF3 subflow", () => {
  seedBuiltinExecutors();

  it("parent runs child and returns marked items", async () => {
    const parent = loadDogfoodFixture("subflow-parent");
    const child = loadDogfoodFixture("subflow-child");

    expect(child.id).toBe("dogfood-child");

    const result = await executeWorkflow({
      workflow: parent,
      nodeExecutors: getExecutorMap(),
      pinData: {
        "Manual Trigger": [{ json: { user: "Ada", n: 1 } }],
      },
      subWorkflows: {
        "dogfood-child": child,
      },
    });

    expect(result.success).toBe(true);
    const items = result.runData["Run Child"]?.items?.[0] ?? [];
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].json.fromChild).toBe("yes");
    expect(items[0].json.user).toBe("Ada");
    expect(items[0].json.n).toBe(1);
  });

  it("loads child via resolveSubWorkflow callback (simulates DB)", async () => {
    const parent = loadDogfoodFixture("subflow-parent");
    const child = loadDogfoodFixture("subflow-child");
    const store: Record<string, typeof child> = {
      [child.id!]: child,
      "wf-ms5jx0ds-2": child,
    };

    // Point parent at a realistic UI id
    const runChild = parent.nodes.find((n) => n.name === "Run Child");
    if (runChild) runChild.parameters = { ...runChild.parameters, workflowId: "wf-ms5jx0ds-2" };

    const result = await executeWorkflow({
      workflow: parent,
      nodeExecutors: getExecutorMap(),
      pinData: {
        "Manual Trigger": [{ json: { user: "Bob" } }],
      },
      resolveSubWorkflow: async (id) => store[id] ?? null,
    });

    expect(result.success).toBe(true);
    expect(result.runData["Run Child"]?.items?.[0]?.[0]?.json.fromChild).toBe("yes");
    expect(result.runData["Run Child"]?.items?.[0]?.[0]?.json.user).toBe("Bob");
  });
});
