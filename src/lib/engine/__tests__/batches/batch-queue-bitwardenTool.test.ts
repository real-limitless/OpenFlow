import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.bitwardenTool";

function mockJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let calls: Array<{ url: string; method?: string }> = [];

const FAKE_TOKEN = "fake_access_token_123";

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const key = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: key, method });

      if (key.includes("identity/connect/token")) {
        return mockJsonResponse({ access_token: FAKE_TOKEN, token_type: "Bearer", expires_in: 3600 });
      }

      if (!(key in routes)) {
        return mockJsonResponse({ error: "Not found", message: "Resource not found" }, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

const CREDENTIALS = {
  bitwardenApi: {
    clientId: "test.client-id",
    clientSecret: "test-client-secret",
    environment: "cloud",
  },
};

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue bitwardenTool — n8n-nodes-base.bitwardenTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Bitwarden Tool");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.bitwardenTool")).toBe(canonical);
  });

  it("get a collection by ID", async () => {
    const collectionId = "5e59c8c7-e05a-4d17-8e85-acc301343926";
    const fakeResponse = {
      id: collectionId,
      organizationId: "9074015e-e2b7-4373-8b7b-362e4c4d9cd0",
      name: "Engineering Secrets",
      externalId: null,
      creationDate: "2023-01-15T10:00:00Z",
      revisionDate: "2023-06-20T14:30:00Z",
    };
    installFetch({ [`https://api.bitwarden.com/v1/collections/${collectionId}`]: fakeResponse });

    const out = await runNode(
      TYPE,
      { resource: "collection", operation: "get", collectionId },
      [{}],
      { credentials: CREDENTIALS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(collectionId);
    expect(out[0][0].json.name).toBe("Engineering Secrets");
    expect(out[0][0].json.organizationId).toBe("9074015e-e2b7-4373-8b7b-362e4c4d9cd0");
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("list all members with search filter", async () => {
    const fakeResponse = {
      data: [
        { id: "m1", email: "john@example.com", type: 2, status: 1, object: "member" },
      ],
    };
    const expectedUrl = "https://api.bitwarden.com/v1/members?limit=10&search=john";
    installFetch({ [expectedUrl]: fakeResponse });

    const out = await runNode(
      TYPE,
      { resource: "member", operation: "getAll", returnAll: false, limit: 10, filters: { search: "john" } },
      [{}],
      { credentials: CREDENTIALS },
    );

    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json.data)).toBe(true);
    const data = out[0][0].json.data as Array<Record<string, unknown>>;
    expect(data[0].id).toBe("m1");
    expect(data[0].email).toBe("john@example.com");
    expect(calls.some((c) => c.url.includes("search=john"))).toBe(true);
  });

  it("create a new group", async () => {
    const fakeResponse = {
      id: "g1",
      name: "DevOps Team",
      accessAll: false,
      creationDate: "2026-01-01T00:00:00Z",
      revisionDate: "2026-01-01T00:00:00Z",
    };
    installFetch({ "https://api.bitwarden.com/v1/groups": fakeResponse });

    const out = await runNode(
      TYPE,
      { resource: "group", operation: "create", name: "DevOps Team" },
      [{}],
      { credentials: CREDENTIALS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("g1");
    expect(out[0][0].json.name).toBe("DevOps Team");
    expect(out[0][0].json.accessAll).toBe(false);
  });

  it("continueOnFail with unknown operation yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "collection", operation: "nope" },
      [{}],
      { continueOnFail: true, credentials: CREDENTIALS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("fails when credential is missing", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "collection", operation: "get", collectionId: "x" }, [{}]),
    ).rejects.toThrow(/credential/i);
  });

  it("missing required parameter throws before API call", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "collection", operation: "get" }, [{}], { credentials: CREDENTIALS }),
    ).rejects.toThrow(/collectionId/i);
  });

  it("update a collection with groupIds", async () => {
    const collectionId = "5e59c8c7-e05a-4d17-8e85-acc301343926";
    const fakeResponse = {
      id: collectionId,
      organizationId: "9074015e-e2b7-4373-8b7b-362e4c4d9cd0",
      name: "Engineering Secrets",
      groups: [{ id: "f47ac10b-58cc-4372-a567-0e02b2c3d479", name: "Admins", accessAll: false }],
      externalId: null,
      creationDate: "2023-01-15T10:00:00Z",
      revisionDate: "2023-06-20T14:30:00Z",
    };
    installFetch({ [`https://api.bitwarden.com/v1/collections/${collectionId}`]: fakeResponse });

    const out = await runNode(
      TYPE,
      {
        resource: "collection",
        operation: "update",
        collectionId,
        updateFields: { groupIds: "f47ac10b-58cc-4372-a567-0e02b2c3d479" },
      },
      [{}],
      { credentials: CREDENTIALS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(collectionId);
    expect(Array.isArray(out[0][0].json.groups)).toBe(true);
  });

  it("resolves expression-style params (resource and operation via ={{ }}", async () => {
    const fakeResponse = {
      id: "g1",
      name: "DevOps Team",
      accessAll: false,
      creationDate: "2026-01-01T00:00:00Z",
      revisionDate: "2026-01-01T00:00:00Z",
    };
    installFetch({ "https://api.bitwarden.com/v1/groups": fakeResponse });

    const out = await runNode(
      TYPE,
      {
        resource: "={{ $json.resource }}",
        operation: "={{ $json.operation }}",
        name: "DevOps Team",
      },
      [{ resource: "group", operation: "create" }],
      { credentials: CREDENTIALS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("g1");
    expect(out[0][0].json.name).toBe("DevOps Team");
  });

});
