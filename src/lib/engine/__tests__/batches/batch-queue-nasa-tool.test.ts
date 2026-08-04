import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor, getExecutorMap } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.nasaTool";
const FAKE_KEY = "DEMO_KEY";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return status === 200 ? JSON.stringify(body) : "error";
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      if (!(key in routes)) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

function makeCredCtx(
  items: Array<Record<string, unknown>> = [{}],
  parameters: Record<string, unknown> = {},
  opts?: { continueOnFail?: boolean },
): ExecutionContext {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const normalized: INodeExecutionData[] = items.map((item) => ({ json: item }));
  return createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => normalized,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ apiKey: FAKE_KEY }),
  });
}

async function runCredNode(
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
): Promise<INodeExecutionData[][]> {
  const map = getExecutorMap();
  const executor = map[TYPE];
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  const ctx = makeCredCtx(inputItems, parameters, opts);
  const node = makeNode({ name: "N", type: TYPE, parameters });
  return executor(ctx, node);
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue nasa-tool — n8n-nodes-base.nasaTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("NASA (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.nasaTool")).toBe(canonical);
  });

  it("astronomyPictureOfTheDay — returns APOD response", async () => {
    const fakeApod = {
      title: "Test APOD",
      explanation: "A test picture",
      url: "https://apod.nasa.gov/test.jpg",
      date: "2024-01-01",
      media_type: "image",
    };
    installFetch({
      [`https://api.nasa.gov/planetary/apod?api_key=${FAKE_KEY}&date=2024-01-01`]: fakeApod,
    });
    const out = await runCredNode(
      { resource: "astronomyPictureOfTheDay", additionalFields: { date: "2024-01-01" } },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeApod);
  });

  it("asteroidNeoLookup — looks up asteroid by ID", async () => {
    const fakeNeo = {
      id: "2000433",
      name: "433 Eros",
      absolute_magnitude_h: 10.4,
      is_potentially_hazardous_asteroid: false,
    };
    installFetch({
      [`https://api.nasa.gov/neo/rest/v1/neo/2000433?api_key=${FAKE_KEY}`]: fakeNeo,
    });
    const out = await runCredNode({ resource: "asteroidNeoLookup", asteroidId: "2000433" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeNeo);
  });

  it("asteroidNeoLookup — errors when asteroidId missing", async () => {
    installFetch({});
    await expect(
      runCredNode({ resource: "asteroidNeoLookup", asteroidId: "" }, [{}]),
    ).rejects.toThrow(/asteroidId/i);
  });

  it("donkiSolarFlare — returns solar flare data", async () => {
    const fakeFlares = [{ flareID: "2024-01-01T00:00:00-FLR-001", classType: "M1.0" }];
    installFetch({
      [`https://api.nasa.gov/DONKI/FLR?api_key=${FAKE_KEY}&startDate=2024-01-01&endDate=2024-01-07`]: fakeFlares,
    });
    const out = await runCredNode(
      { resource: "donkiSolarFlare", additionalFields: { startDate: "2024-01-01", endDate: "2024-01-07" } },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeFlares);
  });

  it("earthAssets — returns asset metadata", async () => {
    const fakeAssets = { date: "2024-01-01", id: "LANDSAT_LC8", url: "https://example.com/asset" };
    installFetch({
      [`https://api.nasa.gov/planetary/earth/assets?api_key=${FAKE_KEY}&lat=34.05&lon=-118.25`]: fakeAssets,
    });
    const out = await runCredNode(
      { resource: "earthAssets", additionalFields: { lat: 34.05, lon: -118.25 } },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeAssets);
  });

  it("asteroidNeoBrowse — respects limit parameter", async () => {
    const fakeBrowse = {
      near_earth_objects: [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
        { id: "3", name: "C" },
      ],
    };
    installFetch({
      [`https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=${FAKE_KEY}&size=2`]: fakeBrowse,
    });
    const out = await runCredNode(
      { resource: "asteroidNeoBrowse", returnAll: false, limit: 2 },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const neos = (out[0][0].json as Record<string, unknown>).near_earth_objects as unknown[];
    expect(neos).toHaveLength(2);
  });

  it("continueOnFail — yields error item on API failure", async () => {
    installFetch({});
    const map = getExecutorMap();
    const executor = map[TYPE];
    const ctx = makeCredCtx([{}], { resource: "asteroidNeoLookup", asteroidId: "nonexistent", continueOnFail: true }, { continueOnFail: true });
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "asteroidNeoLookup", asteroidId: "nonexistent" } });
    const out = await executor!(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through — one output per input", async () => {
    const fakeApod = { title: "Test", url: "https://example.com", media_type: "image" };
    installFetch({
      [`https://api.nasa.gov/planetary/apod?api_key=${FAKE_KEY}`]: fakeApod,
    });
    const out = await runCredNode({ resource: "astronomyPictureOfTheDay" }, [{}, {}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual(fakeApod);
    expect(out[0][1].json).toEqual(fakeApod);
  });
});
