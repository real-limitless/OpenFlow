import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dateTime";

describe("batch-queue date-time — n8n-nodes-base.dateTime", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Date & Time");
  });

  it("formats a date with a preset (acceptance: formatDate yyyy-MM-dd)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "formatDate",
        date: "1986-09-04T08:30:00.000Z",
        format: "yyyy-MM-dd",
        outputFieldName: "formattedDate",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ formattedDate: "1986-09-04" });
  });

  it("adds days to a date (acceptance: addToDate)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "addToDate",
        magnitude: "2020-01-15T12:00:00.000Z",
        timeUnit: "days",
        duration: 2,
        outputFieldName: "newDate",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ newDate: "2020-01-17T12:00:00.000Z" });
  });

  it("gets current date at midnight in GMT (acceptance: getCurrentDate includeTime false)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "getCurrentDate",
        includeTime: false,
        outputFieldName: "currentDate",
        options: { timezone: "GMT" },
      },
      [{}],
    );
    const iso = out[0][0].json.currentDate as string;
    // Today in GMT at midnight.
    const now = new Date();
    const expected = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    expect(iso).toBe(expected);
    expect(iso.endsWith("T00:00:00.000Z")).toBe(true);
  });

  it("computes time between dates as object (acceptance: getTimeBetweenDates)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "getTimeBetweenDates",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: "2021-04-14T00:00:00.000Z",
        units: ["year", "month", "day"],
        outputFieldName: "timeDifference",
        options: { isoString: false },
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({
      timeDifference: { years: 1, months: 3, days: 13 },
    });
  });

  it("rounds a date down to month, preserving input fields (acceptance: roundDate)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "roundDate",
        date: "2020-03-15T12:34:56.000Z",
        mode: "roundDown",
        toNearest: "month",
        outputFieldName: "roundedDate",
        options: { includeInputFields: true },
      },
      [{ id: 7 }],
    );
    expect(out[0][0].json).toEqual({
      id: 7,
      roundedDate: "2020-03-01T00:00:00.000Z",
    });
  });

  it("emits only the output field when includeInputFields is false (default)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "formatDate",
        date: "1986-09-04T08:30:00.000Z",
        format: "yyyy-MM-dd",
        outputFieldName: "formattedDate",
      },
      [{ keepMe: 1 }],
    );
    expect(out[0][0].json).toEqual({ formattedDate: "1986-09-04" });
  });

  it("subtracts from a date", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "subtractFromDate",
        magnitude: "2020-01-17T12:00:00.000Z",
        timeUnit: "days",
        duration: 2,
        outputFieldName: "newDate",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ newDate: "2020-01-15T12:00:00.000Z" });
  });

  it("extracts a date part", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractDate",
        date: "1986-09-04T08:30:00.000Z",
        part: "month",
        outputFieldName: "datePart",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ datePart: 9 });
  });

  it("formats as Unix seconds (X) and ms (x)", async () => {
    const secs = await runNode(
      TYPE,
      { operation: "formatDate", date: "2020-01-01T00:00:00.000Z", format: "X" },
      [{}],
    );
    expect(secs[0][0].json.formattedDate).toBe(1577836800);
    const ms = await runNode(
      TYPE,
      { operation: "formatDate", date: "2020-01-01T00:00:00.000Z", format: "x" },
      [{}],
    );
    expect(ms[0][0].json.formattedDate).toBe(1577836800000);
  });

  it("rounds up to end of month", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "roundDate",
        date: "2020-03-15T12:34:56.000Z",
        mode: "roundUp",
        outputFieldName: "roundedDate",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ roundedDate: "2020-03-31T23:59:59.999Z" });
  });

  it("emits an ISO duration string when isoString is true", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "getTimeBetweenDates",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: "2021-04-14T00:00:00.000Z",
        units: ["year", "month", "day"],
        outputFieldName: "timeDifference",
        options: { isoString: true },
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({ timeDifference: "P1Y3M13D" });
  });

  it("throws on an unparseable date", async () => {
    await expect(
      runNode(TYPE, { operation: "formatDate", date: "not-a-date", format: "yyyy-MM-dd" }, [{}]),
    ).rejects.toThrow();
  });

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "DT",
          type: TYPE,
          parameters: {
            operation: "formatDate",
            date: "1986-09-04T08:30:00.000Z",
            format: "yyyy-MM-dd",
            outputFieldName: "formattedDate",
          },
        }),
      ],
      {
        Start: { main: [[{ node: "DT", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.DT?.status).toBe("success");
    expect(result.runData.DT?.items?.[0][0].json).toEqual({ formattedDate: "1986-09-04" });
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.dateTime")).toBe(canonical);
  });
});
