import { describe, it, expect } from "vitest";
import { executeWorkflow } from "../runner";
import { defaultExecutors } from "../executors";
import type { NodeExecutor } from "../types";
import type { IWorkflow } from "../../workflow/types";

describe("Phase 5 Gate: Medium Workflow", () => {
  it("runs Manual→Set→Switch→(NoOp|Set) pipeline", async () => {
    const workflow: IWorkflow = {
      id: "gate5",
      name: "Phase 5 Gate",
      active: false,
      nodes: [
        {
          id: "1",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "Set Score",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [200, 0],
          parameters: {
            mode: "manual",
            fields: {
              values: [
                { name: "score", value: 85, type: "numberValue" },
                { name: "name", value: "Alice", type: "stringValue" },
              ],
            },
          },
        },
        {
          id: "3",
          name: "Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 3,
          position: [400, 0],
          parameters: {
            mode: "rules",
            rules: {
              values: [
                {
                  leftValue: "={{ $json.score }}",
                  operator: { type: "number", operation: "gte" },
                  rightValue: "70",
                  outputKey: "pass",
                },
                {
                  leftValue: "={{ $json.score }}",
                  operator: { type: "number", operation: "lt" },
                  rightValue: "70",
                  outputKey: "fail",
                },
              ],
            },
            options: {},
          },
        },
        {
          id: "4",
          name: "Passed",
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
          position: [600, -100],
          parameters: {},
        },
        {
          id: "5",
          name: "Failed",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [600, 100],
          parameters: {
            mode: "manual",
            fields: {
              values: [{ name: "result", value: "fail", type: "stringValue" }],
            },
          },
        },
      ],
      connections: {
        "Manual Trigger": { main: [[{ node: "Set Score", type: "main", index: 0 }]] },
        "Set Score": { main: [[{ node: "Switch", type: "main", index: 0 }]] },
        Switch: {
          main: [
            [{ node: "Passed", type: "main", index: 0 }],
            [{ node: "Failed", type: "main", index: 0 }],
          ],
        },
      },
      settings: { executionOrder: "v1" },
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: defaultExecutors,
    });

    expect(result.success).toBe(true);
    expect(result.runData["Manual Trigger"].status).toBe("success");
    expect(result.runData["Set Score"].status).toBe("success");
    expect(result.runData["Switch"].status).toBe("success");
    expect(result.runData["Passed"].status).toBe("success");

    const setOutput = result.runData["Set Score"].items;
    expect(setOutput).toBeDefined();
    expect(setOutput![0][0].json.score).toBe(85);
    expect(setOutput![0][0].json.name).toBe("Alice");

    const switchOutput = result.runData["Switch"].items;
    expect(switchOutput).toBeDefined();
    expect(switchOutput![0]).toHaveLength(1);
    expect(switchOutput![1]).toHaveLength(0);

    expect(setOutput![0][0].pairedItem).toBeDefined();

    const passedOutput = result.runData["Passed"].items;
    expect(passedOutput).toBeDefined();
    expect(passedOutput![0]).toHaveLength(1);
    expect(passedOutput![0][0].json.score).toBe(85);
  });

  it("handles continueOnFail when a node throws", async () => {
    const workflow: IWorkflow = {
      id: "gate5-err",
      name: "Phase 5 Error Gate",
      active: false,
      nodes: [
        {
          id: "1",
          name: "Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "Failing Node",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [200, 0],
          parameters: {},
          continueOnFail: true,
        },
      ],
      connections: {
        Trigger: { main: [[{ node: "Failing Node", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
    };

    const failingExecutor: NodeExecutor = async () => {
      throw new Error("Intentional failure");
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: {
        "n8n-nodes-base.manualTrigger": defaultExecutors["n8n-nodes-base.manualTrigger"],
        "n8n-nodes-base.set": failingExecutor,
      },
    });

    expect(result.runData["Failing Node"].status).toBe("error");
    expect(result.runData["Failing Node"].error).toBe("Intentional failure");
  });

  it("evaluates expressions in Set node parameters", async () => {
    const workflow: IWorkflow = {
      id: "gate5-expr",
      name: "Phase 5 Expression Gate",
      active: false,
      nodes: [
        {
          id: "1",
          name: "Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [200, 0],
          parameters: {
            mode: "manual",
            fields: {
              values: [
                { name: "copied", value: "={{ $json.score }}", type: "numberValue" },
                { name: "doubled", value: "={{ $json.score * 2 }}", type: "numberValue" },
              ],
            },
          },
        },
      ],
      connections: {
        Trigger: { main: [[{ node: "Set", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: defaultExecutors,
      pinData: { Trigger: [{ json: { score: 42 } }] },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Set"].status).toBe("success");
    expect(result.runData["Set"].items![0][0].json.copied).toBe(42);
    expect(result.runData["Set"].items![0][0].json.doubled).toBe(84);
  });
});
