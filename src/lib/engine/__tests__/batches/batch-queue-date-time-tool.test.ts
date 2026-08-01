import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dateTimeTool";

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

async function runDateTimeTool(
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

describe("batch-queue dateTimeTool — n8n-nodes-base.dateTimeTool", () => {
  it("is registered as executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("resolves under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.dateTimeTool")).toBe(canonical);
  });

  it("add duration to a date", async () => {
    const out = await runDateTimeTool(
      {
        operation: "addToDate",
        date: "2024-01-15T00:00:00Z",
        timeUnit: "days",
        magnitude: 10,
        outputFieldName: "newDate",
      },
      [{ date: "2024-01-15T00:00:00Z" }],
    );

    expect(out[0]).toHaveLength(1);
    const val = out[0][0].json.newDate as string;
    expect(val).toBe("2024-01-25T00:00:00.000Z");
  });

  it("format a date with preset MM/DD/YYYY", async () => {
    const out = await runDateTimeTool(
      {
        operation: "formatDate",
        date: "1986-09-04",
        format: "MM/DD/YYYY",
        outputFieldName: "formatted",
      },
      [{ date: "1986-09-04" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.formatted).toBe("09/04/1986");
  });

  it("format date with customFormat throws when empty", async () => {
    await expect(
      runDateTimeTool(
        {
          operation: "formatDate",
          date: "2024-01-01",
          format: "customFormat",
          customFormat: "",
          outputFieldName: "out",
        },
        [{ date: "2024-01-01" }],
      ),
    ).rejects.toThrow(/customFormat must not be empty/i);
  });

  it("get current date without time", async () => {
    const out = await runDateTimeTool(
      {
        operation: "getCurrentDate",
        includeTime: false,
        outputFieldName: "now",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    const val = out[0][0].json.now as string;
    expect(val).toMatch(/T00:00:00\.000Z$/);
  });

  it("roundDate with roundUp and toNearest day", async () => {
    const out = await runDateTimeTool(
      {
        operation: "roundDate",
        date: "2024-03-15T10:30:00Z",
        mode: "roundUp",
        toNearest: "day",
        outputFieldName: "rounded",
      },
      [{ date: "2024-03-15T10:30:00Z" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.rounded).toBe("2024-03-16T00:00:00.000Z");
  });

  it("extract date part", async () => {
    const out = await runDateTimeTool(
      {
        operation: "extractDate",
        date: "2024-06-15",
        part: "month",
        outputFieldName: "part",
      },
      [{ date: "2024-06-15" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.part).toBe(6);
  });

  it("outputAsISO produces ISO 8601 duration string", async () => {
    const out = await runDateTimeTool(
      {
        operation: "getTimeBetweenDates",
        startDate: "2024-01-01",
        endDate: "2025-06-15",
        units: ["years", "months", "days"],
        outputFieldName: "diff",
        options: { outputAsISO: true },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    const val = out[0][0].json.diff as string;
    expect(val).toMatch(/^P/);
  });

  it("fromDateFormat in options parses non-standard format", async () => {
    const out = await runDateTimeTool(
      {
        operation: "formatDate",
        date: "09/04/1986",
        format: "YYYY-MM-DD",
        outputFieldName: "formatted",
        options: { fromDateFormat: "MM/dd/yyyy" },
      },
      [{ date: "09/04/1986" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.formatted).toBe("1986-09-04");
  });

  it("useWorkflowTimezone in options does not crash", async () => {
    const out = await runDateTimeTool(
      {
        operation: "formatDate",
        date: "1986-09-04",
        format: "MM/DD/YYYY",
        outputFieldName: "formatted",
        options: { useWorkflowTimezone: true },
      },
      [{ date: "1986-09-04" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.formatted).toBeTypeOf("string");
  });

  it("roundDate with roundDown and toNearest month", async () => {
    const out = await runDateTimeTool(
      {
        operation: "roundDate",
        date: "2024-03-25T14:30:00Z",
        mode: "roundDown",
        toNearest: "month",
        outputFieldName: "rounded",
      },
      [{ date: "2024-03-25T14:30:00Z" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.rounded).toBe("2024-03-01T00:00:00.000Z");
  });

  it("time between dates (multi-unit) returns per-unit object", async () => {
    const out = await runDateTimeTool(
      {
        operation: "getTimeBetweenDates",
        startDate: "2024-01-01",
        endDate: "2025-06-15",
        units: ["years", "months", "days"],
        outputFieldName: "diff",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    const diff = out[0][0].json.diff as Record<string, number>;
    expect(diff.years).toBeTypeOf("number");
    expect(diff.months).toBeTypeOf("number");
    expect(diff.days).toBeTypeOf("number");
  });

  it("includes input fields when option set", async () => {
    const out = await runDateTimeTool(
      {
        operation: "getCurrentDate",
        includeTime: false,
        outputFieldName: "now",
        options: { includeInputFields: true },
      },
      [{ json: { userId: 42, name: "Alice" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.userId).toBe(42);
    expect(out[0][0].json.name).toBe("Alice");
    expect(out[0][0].json.now).toMatch(/T00:00:00\.000Z$/);
  });

  it("throws on unknown operation", async () => {
    await expect(
      runDateTimeTool({ operation: "bogus" }, [{}]),
    ).rejects.toThrow(/unknown operation/i);
  });

  it("continue on fail produces error item", async () => {
    const out = await runDateTimeTool(
      { operation: "bogus" },
      [{}],
      true,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });
});
