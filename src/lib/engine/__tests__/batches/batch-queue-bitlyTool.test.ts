import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.bitlyTool";

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

function createBitlyToolCtx(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
): ExecutionContext {
  const node = makeNode({ name: "Bitly Tool", type: TYPE, parameters: params });
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

async function runBitlyTool(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
) {
  const executor = getExecutor(TYPE)!;
  const ctx = createBitlyToolCtx(params, inputItems, continueOnFail);
  return executor(ctx, makeNode({ name: "Bitly Tool", type: TYPE, parameters: params }));
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("batch-queue bitlyTool — n8n-nodes-base.bitlyTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Bitly (AI Tool)");
  });

  it("Create — shortens a URL (AI agent tool mode)", async () => {
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
    const out = await runBitlyTool(
      { resource: "Link", operation: "Create", longUrl: "https://example.com/very/long/path" },
      [{ json: {} }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.link).toBe("https://bit.ly/abc123");
    expect(out[0][0].json.long_url).toBe("https://example.com/very/long/path");
    expect(calls).toHaveLength(1);
  });

  it("Get — retrieves link details by ID (standard mode)", async () => {
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
    const out = await runBitlyTool(
      { resource: "Link", operation: "Get", id: "bit.ly/abc123" },
      [{ json: { bitlinkId: "bit.ly/abc123" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("bit.ly/abc123");
    expect(out[0][0].json.long_url).toBe("https://example.com/original");
    expect(calls).toHaveLength(1);
  });

  it("Update — modifies archived flag", async () => {
    const fakeResponse = {
      id: "bit.ly/abc123",
      link: "https://bit.ly/abc123",
      long_url: "https://example.com/original",
      archived: true,
      tags: [],
      created_at: "2024-01-01T00:00:00Z",
      references: {},
    };
    installFetch({
      "https://api-ssl.bitly.com/v4/bitlinks/bit.ly%2Fabc123": fakeResponse,
    });
    const out = await runBitlyTool(
      { resource: "Link", operation: "Update", id: "bit.ly/abc123", archived: true },
      [{ json: {} }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.archived).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with invalid bitlink yields error item", async () => {
    installFetch({});
    const out = await runBitlyTool(
      { resource: "Link", operation: "Get", id: "bit.ly/nonexistent" },
      [{ json: {} }],
      true,
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("Create — accepts deeplinks parameter", async () => {
    const fakeResponse = {
      id: "bit.ly/abc123",
      link: "https://bit.ly/abc123",
      long_url: "https://example.com",
      deeplinks: [{ app_id: "com.example.app", app_uri_path: "/path" }],
      created_at: "2024-01-01T00:00:00Z",
      archived: false,
      tags: [],
      references: {},
    };
    installFetch({
      "https://api-ssl.bitly.com/v4/shorten": fakeResponse,
    });
    const out = await runBitlyTool(
      {
        resource: "Link",
        operation: "Create",
        longUrl: "https://example.com",
        deeplinks: [{ appId: "com.example.app", appUriPath: "/path", installType: "system", installUrl: "https://example.com/app" }],
      },
      [{ json: {} }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.link).toBe("https://bit.ly/abc123");
    expect(calls).toHaveLength(1);
  });

  it("missing longUrl on Create throws", async () => {
    installFetch({});
    await expect(
      runBitlyTool({ resource: "Link", operation: "Create", longUrl: "" }, [{}]),
    ).rejects.toThrow(/longUrl is required/i);
  });

  it("missing id on Get throws", async () => {
    installFetch({});
    await expect(
      runBitlyTool({ resource: "Link", operation: "Get", id: "" }, [{}]),
    ).rejects.toThrow(/id is required/i);
  });

  it("unsupported resource/operation throws", async () => {
    installFetch({});
    await expect(
      runBitlyTool({ resource: "Link", operation: "Delete" }, [{}]),
    ).rejects.toThrow(/unsupported resource\/operation/i);
  });

  it("handles OAuth2 credential via authentication param", async () => {
    const fakeResponse = {
      id: "bit.ly/oauth-test",
      link: "https://bit.ly/oauth-test",
      long_url: "https://example.com",
      created_at: "2024-01-01T00:00:00Z",
      archived: false,
      tags: [],
      references: {},
    };
    installFetch({
      "https://api-ssl.bitly.com/v4/shorten": fakeResponse,
    });
    const node = makeNode({ name: "Bitly Tool", type: TYPE, parameters: { resource: "Link", operation: "Create", longUrl: "https://example.com", authentication: "oAuth2" } });
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async (name: string) =>
        name === "bitlyOAuth2Api" ? { data: { accessToken: "oauth-token" } } : null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.link).toBe("https://bit.ly/oauth-test");
    expect(calls).toHaveLength(1);
  });
});
