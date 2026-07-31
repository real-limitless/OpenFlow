import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.quickChart";

const MOCK_PNG = Buffer.from("fake-png-data");
const MOCK_SVG = Buffer.from("<svg></svg>");

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("batch-queue quickChart — n8n-nodes-base.quickChart", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("QuickChart");
  });

  it("basic bar chart: returns binary data + data URI", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => MOCK_PNG,
    });

    const out = await runNode(
      TYPE,
      {
        chartType: "bar",
        chart: JSON.stringify({
          data: {
            labels: ["Q1", "Q2", "Q3", "Q4"],
            datasets: [{ label: "Sales", data: [100, 150, 80, 200] }],
          },
        }),
        width: 500,
        height: 300,
        format: "png",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary?.data).toBeDefined();
    expect(out[0][0].binary!.data!.mimeType).toBe("image/png");
    expect(typeof out[0][0].json.data).toBe("string");
    expect((out[0][0].json.data as string).startsWith("data:image/png;base64,")).toBe(true);
  });

  it("dynamic chart from input data (line chart)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => MOCK_PNG,
    });

    const out = await runNode(
      TYPE,
      {
        chartType: "line",
        chart: JSON.stringify({
          data: {
            labels: [2012, 2013, 2014, 2015, 2016],
            datasets: [{ label: "Users", data: [120, 60, 50, 180, 120] }],
          },
        }),
        width: 800,
        height: 400,
        format: "png",
      },
      [{ json: { label: "Users", values: [120, 60, 50, 180, 120], labels: [2012, 2013, 2014, 2015, 2016] } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary?.data).toBeDefined();
    expect(out[0][0].binary!.data!.mimeType).toBe("image/png");
  });

  it("custom Chart.js version and SVG output", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => MOCK_SVG,
    });

    const out = await runNode(
      TYPE,
      {
        chartType: "pie",
        chart: JSON.stringify({
          data: {
            labels: ["A", "B", "C"],
            datasets: [{ data: [30, 50, 20] }],
          },
          options: { plugins: { legend: { display: true } } },
        }),
        version: "4",
        format: "svg",
        backgroundColor: "white",
      },
      [{ json: { myData: [30, 50, 20] } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary?.data).toBeDefined();
    expect(out[0][0].binary!.data!.mimeType).toBe("image/svg+xml");
  });

  it("polar chart with explicit devicePixelRatio", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => MOCK_PNG,
    });

    const out = await runNode(
      TYPE,
      {
        chartType: "polar",
        chart: JSON.stringify({
          data: {
            datasets: [{ data: [11, 16, 7, 3, 14] }],
            labels: ["Red", "Green", "Yellow", "Grey", "Blue"],
          },
        }),
        devicePixelRatio: 1,
        width: 400,
        height: 400,
        format: "png",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary?.data).toBeDefined();
    expect(out[0][0].binary!.data!.mimeType).toBe("image/png");
  });

  it("doughnut chart with self-hosted host URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => MOCK_PNG,
    });
    global.fetch = fetchMock;

    await runNode(
      TYPE,
      {
        chartType: "doughnut",
        chart: JSON.stringify({
          data: {
            datasets: [{ data: [10, 20, 30] }],
            labels: ["Red", "Blue", "Yellow"],
          },
        }),
        format: "png",
        options: { host: "https://selfhosted.quickchart.example.com" },
      },
      [{}],
    );

    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toContain("selfhosted.quickchart.example.com");
  });

  it("throws when chart parameter is empty", async () => {
    await expect(runNode(TYPE, { chartType: "bar", chart: "" }, [{}])).rejects.toThrow();
  });

  it("throws when chart parameter is invalid JSON", async () => {
    await expect(runNode(TYPE, { chartType: "bar", chart: "not-json" }, [{}])).rejects.toThrow();
  });

  it("throws when QuickChart API returns non-2xx", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      arrayBuffer: async () => Buffer.from("error"),
    });

    await expect(
      runNode(
        TYPE,
        {
          chartType: "bar",
          chart: JSON.stringify({ data: { labels: ["A"], datasets: [{ data: [1] }] } }),
        },
        [{}],
      ),
    ).rejects.toThrow();
  });

  it("handles API error with continueOnFail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      arrayBuffer: async () => Buffer.from("error"),
    });

    const out = await runNode(
      TYPE,
      {
        chartType: "bar",
        chart: JSON.stringify({ data: { labels: ["A"], datasets: [{ data: [1] }] } }),
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.error).toBe("string");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.quickChart")).toBe(canonical);
  });
});