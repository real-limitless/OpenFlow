import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.oktaTool";

const FAKE_OKTA_URL = "https://dev-123456.okta.com";

const CREDS = {
  oktaApi: { url: FAKE_OKTA_URL, accessToken: "test-ssws-token" },
};

const fakeUser = {
  id: "00u1a2b3c4d5e6f7g8h9i",
  status: "STAGED",
  created: "2026-01-15T12:00:00.000Z",
  lastUpdated: "2026-01-15T12:00:00.000Z",
  profile: {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane.doe@example.com",
    login: "jane.doe@example.com",
  },
  credentials: {},
  type: "user",
  _links: {},
};

const fakeUserList = [fakeUser, { ...fakeUser, id: "00u2b3c4d5e6f7g8h9i0j", profile: { ...fakeUser.profile, email: "john@example.com", login: "john@example.com", firstName: "John", lastName: "Smith" } }];

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : status === 400 ? "Bad Request" : status === 404 ? "Not Found" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Headers({
      "content-type": "application/json",
      link: "",
    }),
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

let calls: Array<{ url: string; method: string; body?: string }> = [];

function installFetch(routes: Record<string, unknown>, statusRoutes: Record<string, number> = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"}:${String(url)}`;
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (statusRoutes[key]) {
        return mockJsonResponse({ error: "error" }, statusRoutes[key]);
      }
      if (key in routes) {
        return mockJsonResponse(routes[key]);
      }
      const getKey = `GET:${String(url)}`;
      if (getKey in routes) {
        return mockJsonResponse(routes[getKey]);
      }
      return mockJsonResponse({ error: "not found" }, 404);
    }),
  );
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue oktaTool — n8n-nodes-base.oktaTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Okta (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.oktaTool")).toBe(canonical);
  });

  it("create user — returns created user object", async () => {
    installFetch({
      "POST:https://dev-123456.okta.com/api/v1/users?activate=false": fakeUser,
    });
    const out = await runNode(TYPE, {
      resource: "user",
      operation: "create",
      options: { activate: false, email: "jane.doe@example.com", firstName: "Jane", lastName: "Doe", login: "jane.doe@example.com" },
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: expect.any(String),
      status: "STAGED",
      profile: expect.objectContaining({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@example.com",
        login: "jane.doe@example.com",
      }),
    });
    expect(calls).toHaveLength(1);
  });

  it("get user — returns user by ID", async () => {
    installFetch({
      "GET:https://dev-123456.okta.com/api/v1/users/00u1a2b3c4d5e6f7g8h9i": fakeUser,
    });
    const out = await runNode(TYPE, {
      operation: "get",
      userId: "00u1a2b3c4d5e6f7g8h9i",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "00u1a2b3c4d5e6f7g8h9i",
      status: "STAGED",
    });
    expect(calls).toHaveLength(1);
  });

  it("getAll users with limit — returns sliced array", async () => {
    installFetch({
      "GET:https://dev-123456.okta.com/api/v1/users?limit=25": fakeUserList,
    });
    const out = await runNode(TYPE, {
      operation: "getAll",
      returnAll: false,
      limit: 25,
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    const users = out[0][0].json as Record<string, unknown>[];
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeLessThanOrEqual(25);
    expect(users[0]).toHaveProperty("id");
    expect(users[0]).toHaveProperty("status");
    expect(users[0]).toHaveProperty("profile");
    expect(calls).toHaveLength(1);
  });

  it("delete user — passes input through unchanged", async () => {
    installFetch({
      "DELETE:https://dev-123456.okta.com/api/v1/users/00u1a2b3c4d5e6f7g8h9i": null,
    });
    const out = await runNode(TYPE, {
      operation: "delete",
      userId: "00u1a2b3c4d5e6f7g8h9i",
    }, [{ email: "test@example.com" }], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ email: "test@example.com" });
    expect(calls).toHaveLength(1);
  });

  it("create user missing required fields — throws 400", async () => {
    installFetch({}, { "POST:https://dev-123456.okta.com/api/v1/users?activate=true": 400 });
    await expect(
      runNode(TYPE, {
        operation: "create",
        options: { firstName: "NoEmail" },
      }, [{}], { credentials: CREDS }),
    ).rejects.toThrow(/email is required/);
  });

  it("continueOnFail with missing userId yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { operation: "get", userId: "" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });
});