import { describe, it, expect, afterEach } from "vitest";
import { vi } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { createExecutionContext, type INodeExecutionData } from "@/sdk";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.evaluationTrigger";

describe("batch-queue evaluationTrigger — n8n-nodes-base.evaluationTrigger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Evaluation Trigger");
  });

  it("single row from data table", async () => {
    const map = getExecutorMap();
    const executor = map[TYPE]!;
    const rows = [{ input: "Hello", expected: "Hi" }];
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        source: "dataTable",
        dataTableId: { mode: "id", value: "dt-1" },
        limitRows: false,
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [],
      continueOnFail: false,
      getCredential: async () => null,
      customData: { "__datatable__dt-1": JSON.stringify(rows) },
    });
    const out = await executor(ctx, node);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ input: "Hello", expected: "Hi" });
    expect(out[0][0].pairedItem).toEqual({ item: 0 });
  });

  it("data table with row limit", async () => {
    const map = getExecutorMap();
    const executor = map[TYPE]!;
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i, value: `row-${i}` }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        source: "dataTable",
        dataTableId: { mode: "id", value: "dt-2" },
        limitRows: true,
        maxRows: 5,
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [],
      continueOnFail: false,
      getCredential: async () => null,
      customData: { "__datatable__dt-2": JSON.stringify(rows) },
    });
    const out = await executor(ctx, node);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(5);
    expect(out[0][0].json).toEqual({ id: 0, value: "row-0" });
    expect(out[0][4].json).toEqual({ id: 4, value: "row-4" });
  });

  it("data table with filter — allConditions", async () => {
    const map = getExecutorMap();
    const executor = map[TYPE]!;
    const rows = [
      { input: "a", status: "active" },
      { input: "b", status: "inactive" },
      { input: "c", status: "active" },
    ];
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        source: "dataTable",
        dataTableId: { mode: "id", value: "dt-3" },
        filterRows: true,
        matchType: "allConditions",
        filters: {
          conditions: [{ keyName: "status", condition: "eq", keyValue: "active" }],
        },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [],
      continueOnFail: false,
      getCredential: async () => null,
      customData: { "__datatable__dt-3": JSON.stringify(rows) },
    });
    const out = await executor(ctx, node);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ input: "a", status: "active" });
    expect(out[0][1].json).toEqual({ input: "c", status: "active" });
  });

  it("zero rows from filter", async () => {
    const map = getExecutorMap();
    const executor = map[TYPE]!;
    const rows = [
      { input: "a", status: "active" },
      { input: "b", status: "inactive" },
    ];
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        source: "dataTable",
        dataTableId: { mode: "id", value: "dt-4" },
        filterRows: true,
        filters: {
          conditions: [{ keyName: "nonexistent", condition: "eq", keyValue: "value" }],
        },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [],
      continueOnFail: false,
      getCredential: async () => null,
      customData: { "__datatable__dt-4": JSON.stringify(rows) },
    });
    const out = await executor(ctx, node);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });
});