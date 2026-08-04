import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.nasaTool";

// nasaTool reads this before issuing any request; without it every test below
// would assert against the "credential is not configured" guard instead of the
// API behaviour it names.
const CREDS = { nasaApi: { apiKey: "test-api-key" } };

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Forbidden",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
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
      for (const [pattern, body] of Object.entries(routes)) {
        if (key.includes(pattern)) {
          return mockJsonResponse(body);
        }
      }
      return mockJsonResponse(null, 404);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const FAKE_APOD = {
  title: "Test APOD",
  explanation: "A test image",
  url: "https://apod.nasa.gov/test.jpg",
  date: "2024-01-01",
  media_type: "image",
};

const FAKE_ASTEROID_LOOKUP = {
  id: "2000433",
  name: "433 Eros",
  absolute_magnitude_h: 10.4,
  is_potentially_hazardous_asteroid: false,
  close_approach_data: [],
};

const FAKE_DONKI_FLARES = [
  { flareID: "2024-01-01-T00-00-00", classType: "M1.0", beginTime: "2024-01-01T00:00:00Z" },
];

const FAKE_EARTH_ASSET = {
  date: "2024-01-01",
  id: "LC08_L1GT_001001_20240101_20240101_01_RT",
  url: "https://landsat.example.com/asset",
};

describe("batch-queue nasaTool — n8n-nodes-base.nasaTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("NASA (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.nasaTool")).toBe(canonical);
  });

  it("fetches APOD with astronomyPictureOfTheDay resource", async () => {
    installFetch({ "/planetary/apod": FAKE_APOD });
    const out = await runNode(TYPE, { resource: "astronomyPictureOfTheDay" }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(FAKE_APOD);
    expect(calls).toHaveLength(1);
  });

  it("looks up asteroid Neo by ID", async () => {
    installFetch({ "/neo/rest/v1/neo/2000433": FAKE_ASTEROID_LOOKUP });
    const out = await runNode(TYPE, { resource: "asteroidNeoLookup", asteroidId: "2000433" }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("2000433");
    expect(calls).toHaveLength(1);
  });

  it("fetches DONKI solar flares with date range", async () => {
    installFetch({ "/DONKI/FLR": FAKE_DONKI_FLARES });
    const out = await runNode(
      TYPE,
      { resource: "donkiSolarFlare", additionalFields: { startDate: "2024-01-01", endDate: "2024-01-07" } },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("retrieves Earth imagery asset metadata", async () => {
    installFetch({ "/planetary/earth/assets": FAKE_EARTH_ASSET });
    const out = await runNode(
      TYPE,
      { resource: "earthAssets", additionalFields: { lat: 41.9, lon: -87.65 } },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.url).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail yields error item on API error", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "astronomyPictureOfTheDay", continueOnFail: true },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    installFetch({ "/planetary/apod": FAKE_APOD });
    const out = await runNode(TYPE, { resource: "astronomyPictureOfTheDay" }, [{}, {}], { credentials: CREDS });
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "astronomyPictureOfTheDay" }, [{}], { credentials: CREDS }),
    ).rejects.toThrow(/HTTP 404/);
  });
});
