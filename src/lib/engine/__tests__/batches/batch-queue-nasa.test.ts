import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.nasa";

vi.mock("@/sdk/helpers/credentials", () => ({
  requireCredential: vi.fn(),
}));

import { requireCredential } from "@/sdk/helpers/credentials";

function mockCredential() {
  vi.mocked(requireCredential).mockResolvedValue({ apiKey: "DEMO_KEY" });
}

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
  };
}

type CallEntry = { url: string };
let calls: CallEntry[] = [];

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

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("batch-queue nasa — n8n-nodes-base.nasa", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("NASA");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.nasa")).toBe(canonical);
  });

  it("APOD — fetch astronomy picture of the day", async () => {
    mockCredential();
    const fakeApod = { date: "2025-08-03", explanation: "A test APOD image", title: "Test APOD", url: "https://example.com/apod.jpg", media_type: "image", service_version: "v1", hdurl: "https://example.com/hd.jpg", copyright: "NASA" };
    installFetch({
      [`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`]: fakeApod,
    });
    const out = await runNode(TYPE, { resource: "astronomyPictureOfTheDay", download: false }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ title: "Test APOD", url: "https://example.com/apod.jpg" });
    expect(calls).toHaveLength(1);
  });

  it("NEO Feed with date range", async () => {
    mockCredential();
    const fakeFeed = { element_count: 2, near_earth_objects: { "2025-01-01": [{ id: "1", name: "Test" }] } };
    installFetch({
      [`https://api.nasa.gov/neo/rest/1/feed?api_key=DEMO_KEY&start_date=2025-01-01&end_date=2025-01-07`]: fakeFeed,
    });
    const out = await runNode(TYPE, { resource: "asteroidNeoFeed", additionalFields: { startDate: "2025-01-01", endDate: "2025-01-07" } }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ element_count: 2 });
    expect(calls).toHaveLength(1);
  });

  it("NEO Lookup with asteroid SPK-ID", async () => {
    mockCredential();
    const fakeAsteroid = { id: "2465633", name: "465633 (2009 JR5)", absolute_magnitude_h: 20.5 };
    installFetch({
      [`https://api.nasa.gov/neo/rest/1/neo/2465633?api_key=DEMO_KEY`]: fakeAsteroid,
    });
    const out = await runNode(TYPE, { resource: "asteroidNeoLookup", asteroidId: "2465633" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "2465633" });
  });

  it("NEO Browse with limit", async () => {
    mockCredential();
    const fakeBrowse = { near_earth_objects: [{ id: "1" }, { id: "2" }, { id: "3" }], page: { size: 3 } };
    installFetch({
      [`https://api.nasa.gov/neo/rest/1/neo/browse?api_key=DEMO_KEY&size=5`]: fakeBrowse,
    });
    const out = await runNode(TYPE, { resource: "asteroidNeoBrowse", returnAll: false, limit: 5 }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ near_earth_objects: [{ id: "1" }, { id: "2" }, { id: "3" }] });
  });

  it("missing credential throws", async () => {
    vi.mocked(requireCredential).mockRejectedValue(new Error('Credential "nasaApi" is not configured on this node'));
    await expect(
      runNode(TYPE, { resource: "astronomyPictureOfTheDay" }, [{}]),
    ).rejects.toThrow(/Credential/);
  });

  it("continueOnFail with missing credential still throws (credential checked before loop)", async () => {
    vi.mocked(requireCredential).mockRejectedValue(new Error('Credential "nasaApi" is not configured on this node'));
    await expect(
      runNodeWithCtx(TYPE, { resource: "astronomyPictureOfTheDay" }, [{}], { continueOnFail: true }),
    ).rejects.toThrow(/Credential/);
  });

  it("multi-item pass-through produces one output per input", async () => {
    mockCredential();
    const fakeApod = { title: "Multi" };
    installFetch({
      [`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`]: fakeApod,
    });
    const out = await runNode(TYPE, { resource: "astronomyPictureOfTheDay", download: false }, [{}, {}]);
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    mockCredential();
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "astronomyPictureOfTheDay" }, [{}]),
    ).rejects.toThrow();
  });

  it("APOD with download=true fetches image binary", async () => {
    mockCredential();
    const fakeApod = { date: "2025-08-03", explanation: "Test", title: "Test", url: "https://example.com/apod.jpg", media_type: "image", hdurl: "https://example.com/hd.jpg", service_version: "v1", copyright: "NASA" };
    let imageFetched = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push({ url: String(url) });
        if (String(url).includes("planetary/apod")) {
          return mockJsonResponse(fakeApod);
        }
        if (String(url) === "https://example.com/hd.jpg" || String(url) === "https://example.com/apod.jpg") {
          imageFetched = true;
          return {
            ok: true,
            headers: { get: () => "image/jpeg", entries: () => new Map() },
            async arrayBuffer() { return new Uint8Array([0xff, 0xd8, 0xff]).buffer; },
          };
        }
        return mockJsonResponse(null, 404);
      }),
    );
    const out = await runNode(TYPE, { resource: "astronomyPictureOfTheDay", download: true, binaryPropertyName: "data" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(imageFetched).toBe(true);
    expect((out[0][0].json as Record<string, unknown>).title).toBe("Test");
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!.data).toBeDefined();
    expect(out[0][0].binary!.data.mimeType).toBe("image/jpeg");
  });

  it("earthImagery returns binary data", async () => {
    mockCredential();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push({ url: String(url) });
        if (String(url).includes("planetary/earth/imagery")) {
          return {
            ok: true,
            headers: { get: () => "image/png", entries: () => new Map() },
            async arrayBuffer() { return new Uint8Array([0x89, 0x50, 0x4e]).buffer; },
          };
        }
        return mockJsonResponse(null, 404);
      }),
    );
    const out = await runNode(TYPE, { resource: "earthImagery", lat: 47.751076, lon: -120.740135, binaryPropertyName: "data" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!.data).toBeDefined();
    expect(out[0][0].binary!.data.mimeType).toBe("image/png");
  });

  it("donkiFetch returns raw data without wrapping key", async () => {
    mockCredential();
    const fakeDonki = [{ activityID: "test-1" }, { activityID: "test-2" }];
    installFetch({
      [`https://api.nasa.gov/DONKI/FLR?api_key=DEMO_KEY`]: fakeDonki,
    });
    const out = await runNode(TYPE, { resource: "donkiSolarFlare" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json)).toBe(true);
  });
});