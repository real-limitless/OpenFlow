import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.quickChartTool";

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async () => null,
  });
}

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runQuickChartTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue quickChartTool — n8n-nodes-base.quickChartTool", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered as executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("resolves under canonical type string", () => {
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("generates a bar chart with manual labels", async () => {
    const out = await runQuickChartTool(
      {
        chartType: "bar",
        labelsMode: "manually",
        labelsUi: { labelsValues: [{ label: "A" }, { label: "B" }, { label: "C" }] },
        data: "[10, 25, 15]",
        output: "chartImage",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary?.chartImage).toBeDefined();
    expect(out[0][0].binary!.chartImage!.mimeType).toBe("image/png");
  });

  it("generates a line chart with array labels", async () => {
    const out = await runQuickChartTool(
      {
        chartType: "line",
        labelsMode: "array",
        labelsArray: '["X", "Y", "Z"]',
        data: "[5, 10, 7]",
      },
      [{ json: { dataPoints: [5, 10, 7], labels: ["X", "Y", "Z"] } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary?.data).toBeDefined();
    expect(out[0][0].binary!.data!.mimeType).toBe("image/png");
  });

  it("continueOnFail with invalid data JSON", async () => {
    const out = await runQuickChartTool(
      {
        chartType: "pie",
        data: "NOT_JSON",
        output: "data",
      },
      [{}],
      true,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].binary).toBeUndefined();
  });

  it("throws without data", async () => {
    await expect(
      runQuickChartTool({ chartType: "bar" }, [{}]),
    ).rejects.toThrow(/data parameter is required/);
  });

  it("throws on invalid labelsArray JSON", async () => {
    await expect(
      runQuickChartTool(
        { chartType: "pie", labelsMode: "array", labelsArray: "NOT_JSON", data: "[1,2,3]" },
        [{}],
      ),
    ).rejects.toThrow(/labelsArray/);
  });
});
