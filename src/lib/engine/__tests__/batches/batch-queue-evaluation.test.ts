import { describe, it, expect, vi, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutorMap } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext, type INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.evaluation";

describe("batch-queue evaluation — n8n-nodes-base.evaluation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Evaluation");
  });

  it("checkIfEvaluating — evaluating path", async () => {
    const map = getExecutorMap();
    const executor = map[TYPE]!;
    const items: INodeExecutionData[] = [{ json: { testData: "abc" } }];
    const node = makeNode({ name: "N", type: TYPE, parameters: { operation: "checkIfEvaluating" } });
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
      customData: { __evaluation__: "true" },
    });
    const out = await executor(ctx, node);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ testData: "abc" });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(out[1]).toHaveLength(0);
  });

  it("checkIfEvaluating — not evaluating path", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      { operation: "checkIfEvaluating" },
      [{}],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(0);
    expect(out[1]).toHaveLength(1);
    expect(out[1][0].json).toEqual({});
    expect(out[1][0].pairedItem).toEqual({ item: 0, input: 0 });
  });

  it("setMetrics pass-through with metrics stored", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      {
        operation: "setMetrics",
        metrics: {
          values: [
            { name: "accuracy", value: 0.95 },
          ],
        },
      },
      [{ id: 1, response: "hello" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, response: "hello" });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    const stored = ctx.getAllCustomData();
    expect(stored.__metrics__).toBeDefined();
    const metrics = JSON.parse(stored.__metrics__);
    expect(metrics).toEqual([{ name: "accuracy", value: 0.95 }]);
  });

  it("setMetrics throws on non-numeric value", async () => {
    await expect(
      runNode(
        TYPE,
        {
          operation: "setMetrics",
          metrics: {
            values: [
              { name: "bad", value: "not-a-number" },
            ],
          },
        },
        [{}],
      ),
    ).rejects.toThrow("must be numeric");
  });

  it("setOutputs writes to data table", async () => {
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      {
        operation: "setOutputs",
        source: "dataTable",
        dataTable: "my-eval-table",
        outputs: {
          values: [
            { name: "Score", value: "={{ $json.score }}" },
          ],
        },
      },
      [{ input: "test", score: 85 }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ input: "test", score: 85 });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    const stored = ctx.getAllCustomData();
    const tableKey = "__datatable__my-eval-table";
    expect(stored[tableKey]).toBeDefined();
    expect(JSON.parse(stored[tableKey])).toEqual([{ name: "Score", value: 85 }]);
  });

  it("setOutputs throws when dataTable name is missing", async () => {
    await expect(
      runNode(
        TYPE,
        {
          operation: "setOutputs",
          source: "dataTable",
          dataTable: "",
          outputs: {
            values: [{ name: "X", value: "1" }],
          },
        },
        [{}],
      ),
    ).rejects.toThrow("data table is required");
  });

  it("setOutputs resolves Google Sheets params (partial)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const docId = { __rl: true, mode: "id", value: "abc123" };
    const sheetName = { __rl: true, mode: "name", value: "Sheet1" };
    const { out, ctx } = await runNodeWithCtx(
      TYPE,
      {
        operation: "setOutputs",
        source: "googleSheets",
        documentId: docId,
        sheetId: sheetName,
        outputs: {
          values: [{ name: "Result", value: "passed" }],
        },
      },
      [{ id: 1 }],
    );
    expect(out).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1 });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    const stored = ctx.getAllCustomData();
    expect(stored.__datatable__googleSheets).toBeDefined();
    const gs = JSON.parse(stored.__datatable__googleSheets);
    expect(gs.documentId).toBe("abc123");
    expect(gs.sheetId).toBe("Sheet1");
    expect(gs.outputs).toEqual([{ name: "Result", value: "passed" }]);
    warn.mockRestore();
  });

  it("passes through on empty input for setOutputs", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "setOutputs",
        source: "dataTable",
        dataTable: "t",
        outputs: { values: [{ name: "X", value: "1" }] },
      },
      [],
    );
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("runs end-to-end in a workflow with checkIfEvaluating", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Eval",
          type: TYPE,
          parameters: { operation: "checkIfEvaluating" },
        }),
      ],
      {
        Start: { main: [[{ node: "Eval", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Eval?.status).toBe("success");
    expect(result.runData.Eval?.items?.[1]).toHaveLength(1);
  });
});