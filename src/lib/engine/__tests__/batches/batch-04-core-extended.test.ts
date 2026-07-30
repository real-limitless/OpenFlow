import { describe, it, expect } from "vitest";
import { hasExecutor, seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow, runNode } from "../helpers";
import { executeWorkflow } from "../../runner";

const BATCH_TYPES = [
  "n8n-nodes-base.dateTime",
  "n8n-nodes-base.sort",
  "n8n-nodes-base.renameKeys",
  "n8n-nodes-base.errorTrigger",
] as const;

describe("batch-04 core-extended", () => {
  seedBuiltinExecutors();
  seedBuiltinDescriptions();

  it("registers all four batch types", () => {
    for (const t of BATCH_TYPES) {
      expect(hasExecutor(t), t).toBe(true);
      expect(getNodeType(t).placeholder).not.toBe(true);
    }
  });

  describe("dateTime", () => {
    it("formats a date", async () => {
      const out = await runNode(
        "n8n-nodes-base.dateTime",
        {
          operation: "formatDate",
          date: "2020-01-15T12:30:00.000Z",
          format: "yyyy-MM-dd",
          outputFieldName: "result",
        },
        [{}],
      );
      expect(out[0][0].json.result).toBe("2020-01-15");
    });

    it("gets current date", async () => {
      const out = await runNode(
        "n8n-nodes-base.dateTime",
        { operation: "getCurrentDate", outputFieldName: "now" },
        [{}],
      );
      expect(typeof out[0][0].json.now).toBe("string");
      expect(String(out[0][0].json.now).length).toBeGreaterThan(10);
    });

    it("adds days to a date", async () => {
      const out = await runNode(
        "n8n-nodes-base.dateTime",
        {
          operation: "addToDate",
          magnitude: "2020-01-01T00:00:00.000Z",
          duration: 2,
          timeUnit: "days",
          outputFieldName: "result",
        },
        [{}],
      );
      expect(String(out[0][0].json.result)).toContain("2020-01-03");
    });

    it("extracts year part", async () => {
      const out = await runNode(
        "n8n-nodes-base.dateTime",
        {
          operation: "extractDate",
          date: "2020-06-15T00:00:00.000Z",
          part: "year",
          outputFieldName: "y",
        },
        [{}],
      );
      expect(out[0][0].json.y).toBe(2020);
    });
  });

  describe("sort", () => {
    it("sorts ascending by number field", async () => {
      const out = await runNode(
        "n8n-nodes-base.sort",
        { type: "simple", fieldName: "n", order: "ascending" },
        [{ n: 3 }, { n: 1 }, { n: 2 }],
      );
      expect(out[0].map((i) => i.json.n)).toEqual([1, 2, 3]);
    });

    it("sorts descending by string field", async () => {
      const out = await runNode(
        "n8n-nodes-base.sort",
        { type: "simple", fieldName: "name", order: "descending" },
        [{ name: "a" }, { name: "c" }, { name: "b" }],
      );
      expect(out[0].map((i) => i.json.name)).toEqual(["c", "b", "a"]);
    });
  });

  describe("renameKeys", () => {
    it("renames a top-level key", async () => {
      const out = await runNode(
        "n8n-nodes-base.renameKeys",
        { keys: { key: [{ currentKey: "old", newKey: "new" }] } },
        [{ old: 1, keep: true }],
      );
      expect(out[0][0].json).toEqual({ new: 1, keep: true });
    });

    it("renames via keys collection", async () => {
      const out = await runNode(
        "n8n-nodes-base.renameKeys",
        {
          keys: {
            key: [
              { currentKey: "a", newKey: "alpha" },
              { currentKey: "b", newKey: "beta" },
            ],
          },
        },
        [{ a: 1, b: 2 }],
      );
      expect(out[0][0].json).toEqual({ alpha: 1, beta: 2 });
    });
  });

  describe("errorTrigger", () => {
    it("emits structured error payload on empty input", async () => {
      const out = await runNode("n8n-nodes-base.errorTrigger", {}, []);
      expect(out[0][0].json.execution).toBeTruthy();
      expect(out[0][0].json.workflow).toBeTruthy();
      expect(
        (out[0][0].json.execution as { error: { message: string } }).error.message,
      ).toBeTruthy();
    });

    it("starts a workflow as trigger", async () => {
      const wf = makeWorkflow(
        [
          makeNode({ id: "1", name: "Err", type: "n8n-nodes-base.errorTrigger" }),
          makeNode({ id: "2", name: "Pass", type: "n8n-nodes-base.noOp" }),
        ],
        {
          Err: { main: [[{ node: "Pass", type: "main", index: 0 }]] },
        },
      );
      const result = await executeWorkflow({
        workflow: wf,
        nodeExecutors: getExecutorMap(),
      });
      expect(result.success).toBe(true);
      expect(result.runData.Pass?.status).toBe("success");
    });
  });

  it("sort + renameKeys chain", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Sort",
          type: "n8n-nodes-base.sort",
          parameters: { type: "simple", fieldName: "score", order: "descending" },
        }),
        makeNode({
          id: "3",
          name: "Rename",
          type: "n8n-nodes-base.renameKeys",
          parameters: { keys: { key: [{ currentKey: "score", newKey: "points" }] } },
        }),
      ],
      {
        Start: { main: [[{ node: "Sort", type: "main", index: 0 }]] },
        Sort: { main: [[{ node: "Rename", type: "main", index: 0 }]] },
      },
    );

    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: {
        Start: [{ json: { score: 1 } }, { json: { score: 9 } }, { json: { score: 5 } }],
      },
    });
    expect(result.success).toBe(true);
    const items = result.runData.Rename?.items?.[0] ?? [];
    expect(items.map((i) => i.json.points)).toEqual([9, 5, 1]);
  });
});
