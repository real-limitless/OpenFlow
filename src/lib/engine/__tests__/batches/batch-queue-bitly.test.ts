import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.bitly";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Bad Request",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
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
        return mockJsonResponse({ message: "Not found" }, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

function createBitlyCtx(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
): ExecutionContext {
  const node = makeNode({ name: "Bitly", type: TYPE, parameters: params });
  const normalized = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? item
      : { json: item },
  );
  return createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => normalized,
    continueOnFail,
    getCredential: async () => ({ data: { accessToken: "test-token" } }),
  });
}

async function runBitly(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
) {
  const executor = getExecutor(TYPE)!;
  const ctx = createBitlyCtx(params, inputItems, continueOnFail);
  return executor(ctx, makeNode({ name: "Bitly", type: TYPE, parameters: params }));
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("batch-queue bitly — n8n-nodes-base.bitly", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Bitly");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.bitly")).toBe(canonical);
  });

  it("Create — shortens a URL", async () => {
    const fakeResponse = {
      id: "bit.ly/abc123",
      link: "https://bit.ly/abc123",
      long_url: "https://example.com/very/long/path",
      created_at: "2024-01-01T00:00:00Z",
      archived: false,
      tags: [],
      references: { group: "https://api-ssl.bitly.com/v4/groups/test" },
    };
    installFetch({
      "https://api-ssl.bitly.com/v4/shorten": fakeResponse,
    });
    const out = await runBitly(
      { resource: "Link", operation: "Create", longUrl: "https://example.com/very/long/path" },
      [{ json: { url: "https://example.com/very/long/path" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.link).toBe("https://bit.ly/abc123");
    expect(out[0][0].json.long_url).toBe("https://example.com/very/long/path");
    expect(calls).toHaveLength(1);
  });

  it("Get — retrieves link details by bitlink ID", async () => {
    const fakeResponse = {
      id: "bit.ly/abc123",
      link: "https://bit.ly/abc123",
      long_url: "https://example.com/original",
      created_at: "2024-01-01T00:00:00Z",
      archived: false,
      tags: [],
      references: {},
    };
    installFetch({
      "https://api-ssl.bitly.com/v4/bitlinks/bit.ly%2Fabc123": fakeResponse,
    });
    const out = await runBitly(
      { resource: "Link", operation: "Get", bitlinkId: "bit.ly/abc123" },
      [{ json: { bitlinkId: "bit.ly/abc123" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("bit.ly/abc123");
    expect(out[0][0].json.long_url).toBe("https://example.com/original");
    expect(calls).toHaveLength(1);
  });

  it("Update — modifies title and tags", async () => {
    const fakeResponse = {
      id: "bit.ly/abc123",
      link: "https://bit.ly/abc123",
      long_url: "https://example.com/original",
      title: "Updated Title",
      tags: ["tag1", "tag2"],
      archived: false,
      created_at: "2024-01-01T00:00:00Z",
      references: {},
    };
    installFetch({
      "https://api-ssl.bitly.com/v4/bitlinks/bit.ly%2Fabc123": fakeResponse,
    });
    const out = await runBitly(
      {
        resource: "Link",
        operation: "Update",
        bitlinkId: "bit.ly/abc123",
        title: "Updated Title",
        tags: ["tag1", "tag2"],
      },
      [{ json: { bitlinkId: "bit.ly/abc123" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("Updated Title");
    expect(out[0][0].json.tags).toEqual(["tag1", "tag2"]);
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with 404 yields error item", async () => {
    installFetch({});
    const out = await runBitly(
      { resource: "Link", operation: "Get", bitlinkId: "bit.ly/nonexistent" },
      [{ json: { bitlinkId: "bit.ly/nonexistent" } }],
      true,
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing longUrl on Create throws", async () => {
    installFetch({});
    await expect(
      runBitly({ resource: "Link", operation: "Create", longUrl: "" }, [{}]),
    ).rejects.toThrow(/longUrl is required/i);
  });

  it("missing bitlinkId on Get throws", async () => {
    installFetch({});
    await expect(
      runBitly({ resource: "Link", operation: "Get", bitlinkId: "" }, [{}]),
    ).rejects.toThrow(/bitlinkId is required/i);
  });

  it("unsupported resource/operation throws", async () => {
    installFetch({});
    await expect(
      runBitly({ resource: "Link", operation: "Delete" }, [{}]),
    ).rejects.toThrow(/unsupported resource\/operation/i);
  });
});
