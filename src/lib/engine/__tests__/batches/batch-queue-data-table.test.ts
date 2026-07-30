import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dataTable";

describe("batch-queue dataTable — n8n-nodes-base.dataTable", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("DataTable");
  });

  it("outputs one item per table row (happy path)", async () => {
    const out = await runNode(
      TYPE,
      {
        tableData: [
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ],
      },
      [{}],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ name: "Alice", age: 30 });
    expect(out[0][1].json).toEqual({ name: "Bob", age: 25 });
  });

  it("empty tableData outputs single empty item (edge)", async () => {
    const out = await runNode(TYPE, { tableData: [] }, [{}]);
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("missing tableData defaults to single empty item", async () => {
    const out = await runNode(TYPE, {}, [{}]);
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("keepInput merges rows onto input items", async () => {
    const out = await runNode(
      TYPE,
      {
        tableData: [{ name: "Alice" }, { name: "Bob" }],
        options: { keepInput: true },
      },
      [{ id: 1 }, { id: 2 }],
    );
    expect(out[0][0].json).toEqual({ id: 1, name: "Alice" });
    expect(out[0][1].json).toEqual({ id: 2, name: "Bob" });
  });

  it("keepInput with more rows than input items produces standalone items", async () => {
    const out = await runNode(
      TYPE,
      {
        tableData: [{ name: "Alice" }, { name: "Bob" }, { name: "Carol" }],
        options: { keepInput: true },
      },
      [{ id: 1 }],
    );
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toEqual({ id: 1, name: "Alice" });
    expect(out[0][1].json).toEqual({ name: "Bob" });
    expect(out[0][2].json).toEqual({ name: "Carol" });
  });

  it("tableData as JSON string is parsed", async () => {
    const out = await runNode(TYPE, { tableData: '[{ "x": 1 }, { "x": 2 }]' }, [{}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ x: 1 });
    expect(out[0][1].json).toEqual({ x: 2 });
  });

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Table",
          type: TYPE,
          typeVersion: 1,
          parameters: {
            tableData: [{ greeting: "hello" }],
          },
        }),
      ],
      { Start: { main: [[{ node: "Table", type: "main", index: 0 }]] } },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Table?.status).toBe("success");
    expect(result.runData.Table?.items?.[0][0].json).toEqual({ greeting: "hello" });
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.dataTable")).toBe(canonical);
  });
});
