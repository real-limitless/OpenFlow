import { describe, it, expect, vi } from "vitest";
import { createExecutionContext, type ExecutionContext, type INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.marketstackTool";

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return text ? JSON.parse(text) : {};
    },
    async text() {
      return text;
    },
  };
}

function installFetch(result: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string) => mockResponse(result, status)),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { marketstackApi: { name: "marketstackApi" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ apiKey: "test_key_123", useHttps: true }),
  });
  const { defaultExecutors } = await import("@/lib/engine/node-runtime");
  const executor = defaultExecutors[TYPE];
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("marketstackTool", () => {
  it("endOfDayData - getAll returns data array", async () => {
    installFetch({
      pagination: { limit: 5, offset: 0, count: 1, total: 1 },
      data: [
        {
          open: 180.12,
          high: 182.34,
          low: 179.88,
          close: 181.56,
          volume: 50000000,
          adj_open: 180.12,
          adj_high: 182.34,
          adj_low: 179.88,
          adj_close: 181.56,
          adj_volume: 50000000,
          dividend: 0,
          split: 1,
          date: "2024-01-02T00:00:00.000+0000",
          symbol: "AAPL",
          exchange: "XNAS",
        },
      ],
    });
    const [out] = await run({
      resource: "endOfDayData",
      operation: "getAll",
      symbols: "AAPL",
      limit: 5,
    });
    expect(out).toHaveLength(1);
    const data = out[0].json.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].symbol).toBe("AAPL");
    expect(data[0].close).toBe(181.56);
    expect(data[0].volume).toBe(50000000);
    expect(data[0].date).toBe("2024-01-02T00:00:00.000+0000");
  });

  it("exchange - get returns mic and session data", async () => {
    installFetch({
      mic: "XNYS",
      name: "New York Stock Exchange",
      acronym: "NYSE",
      country: "US",
      timezone: "America/New_York",
      open: "09:30",
      high: "10:15",
      low: "09:35",
      close: "16:00",
      volume: 850000000,
      advances: 1800,
      declines: 1200,
    });
    const [out] = await run({
      resource: "exchange",
      operation: "get",
      exchange: "XNYS",
    });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.mic).toBe("XNYS");
    expect(json.name).toBe("New York Stock Exchange");
    expect(json.open).toBe("09:30");
    expect(json.volume).toBe(850000000);
  });

  it("ticker - get returns symbol and price data", async () => {
    installFetch({
      symbol: "MSFT",
      name: "Microsoft Corporation",
      exchange: "XNAS",
      date: "2024-01-02T00:00:00.000+0000",
      open: 375.12,
      high: 378.5,
      low: 374.8,
      close: 376.5,
      volume: 22000000,
      previous_close: 374.5,
      day_change: 2.0,
      day_change_percent: 0.53,
    });
    const [out] = await run({
      resource: "ticker",
      operation: "get",
      symbol: "MSFT",
    });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.symbol).toBe("MSFT");
    expect(json.close).toBe(376.5);
    expect(json.volume).toBe(22000000);
    expect(json.name).toBe("Microsoft Corporation");
  });

  it("missing symbols throws for endOfDayData", async () => {
    await expect(
      run({
        resource: "endOfDayData",
        operation: "getAll",
        symbols: "",
      }),
    ).rejects.toThrow("symbols parameter is required");
  });

  it("missing exchange throws for exchange", async () => {
    await expect(
      run({
        resource: "exchange",
        operation: "get",
        exchange: "",
      }),
    ).rejects.toThrow("exchange parameter is required");
  });

  it("continueOnFail - error produces error output", async () => {
    installFetch({ error: { message: "Invalid API key", code: "invalid_api_key" } }, 401);
    const [out] = await run(
      {
        resource: "endOfDayData",
        operation: "getAll",
        symbols: "AAPL",
        limit: 5,
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toHaveProperty("error");
  });
});
