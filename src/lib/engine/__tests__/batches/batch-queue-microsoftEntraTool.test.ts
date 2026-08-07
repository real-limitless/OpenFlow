import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftEntraTool";

interface FetchCall { url: string; method: string; }

let calls: FetchCall[];

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 201 ? "Created" : status === 204 ? "No Content" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Map(),
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({})) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function runTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = createExecutionContext({
    node,
    workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => inputItems.map((item) => ({ json: item })),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ accessToken: "mock-token" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error("no executor");
  return executor(ctx, node).then((out) => ({ out, ctx }));
}

describe("batch-queue microsoftEntraTool — n8n-nodes-base.microsoftEntraTool", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft Entra ID (AI Tool)");
  });

  describe("User operations", () => {
    it("creates a user", async () => {
      installFetch(mockResponse({
        id: "user-001",
        displayName: "Jane Doe",
        userPrincipalName: "jane.doe@contoso.com",
        mailNickname: "jane.doe",
        mail: "jane.doe@contoso.com",
      }, 201));
      const { out } = await runTool({
        resource: "user",
        operation: "create",
        displayName: "Jane Doe",
        userPrincipalName: "jane.doe@contoso.com",
        mailNickname: "jane.doe",
        password: "P@ssw0rd123!",
        accountEnabled: true,
        additionalFields: { jobTitle: "Engineer", department: "Engineering" },
      }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        id: "user-001",
        displayName: "Jane Doe",
        userPrincipalName: "jane.doe@contoso.com",
      });
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/users");
    });

    it("gets a user", async () => {
      installFetch(mockResponse({
        id: "user-001",
        displayName: "Jane Doe",
        userPrincipalName: "jane.doe@contoso.com",
        mail: "jane@contoso.com",
      }));
      const { out } = await runTool({
        resource: "user",
        operation: "get",
        user: { mode: "id", value: "user-001" },
      }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "user-001" });
    });

    it("lists users with filter", async () => {
      installFetch(mockResponse({
        value: [
          { id: "u1", displayName: "Alice", userPrincipalName: "alice@c.com" },
          { id: "u2", displayName: "Andrew", userPrincipalName: "andrew@c.com" },
        ],
      }));
      const { out } = await runTool({
        resource: "user",
        operation: "getAll",
        returnAll: false,
        limit: 10,
        filter: "startswith(displayName, 'A')",
        output: "simple",
      }, [{}]);
      expect(out[0]).toHaveLength(2);
      expect(calls[0].url).toContain("$filter=");
      expect(calls[0].url).toContain("$top=10");
    });

    it("deletes a user (204 pass-through)", async () => {
      installFetch(mockResponse(null, 204));
      const { out } = await runTool({
        resource: "user",
        operation: "delete",
        user: { mode: "id", value: "user-001" },
      }, [{ groupId: "pass-through" }]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ groupId: "pass-through" });
    });

    it("adds user to group (204 pass-through)", async () => {
      installFetch(mockResponse(null, 204));
      const { out } = await runTool({
        resource: "user",
        operation: "addToGroup",
        user: { mode: "id", value: "user-id-123" },
        group: { mode: "id", value: "group-id-456" },
      }, [{ original: true }]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ original: true });
    });

    it("removes user from group (204 pass-through)", async () => {
      installFetch(mockResponse(null, 204));
      const { out } = await runTool({
        resource: "user",
        operation: "removeFromGroup",
        user: { mode: "id", value: "user-id-123" },
        group: { mode: "id", value: "group-id-456" },
      }, [{ original: true }]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ original: true });
    });
  });

  describe("Group operations", () => {
    it("creates a group", async () => {
      installFetch(mockResponse({
        id: "group-001",
        displayName: "Test Group",
        mailNickname: "testgroup",
        mailEnabled: true,
        securityEnabled: true,
      }, 201));
      const { out } = await runTool({
        resource: "group",
        operation: "create",
        displayName: "Test Group",
        mailNickname: "testgroup",
        mailEnabled: true,
        securityEnabled: true,
      }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "group-001", displayName: "Test Group" });
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/groups");
    });

    it("deletes a group (204 pass-through)", async () => {
      installFetch(mockResponse(null, 204));
      const { out } = await runTool({
        resource: "group",
        operation: "delete",
        group: { mode: "id", value: "02bd9fd6-8f93-4758-87c3-1fb73740a315" },
      }, [{ groupId: "02bd9fd6-8f93-4758-87c3-1fb73740a315" }]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ groupId: "02bd9fd6-8f93-4758-87c3-1fb73740a315" });
    });
  });

  describe("Error handling", () => {
    it("throws when credential is missing", async () => {
      const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "user", operation: "get", user: { mode: "id", value: "u-1" } } });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow("microsoftOAuth2Api");
    });

    it("returns error item when continueOnFail is set and API returns error", async () => {
      installFetch(mockResponse({ error: { message: "Resource not found" } }, 404));
      const { out } = await runTool({
        resource: "user",
        operation: "get",
        user: { mode: "id", value: "nonexistent" },
      }, [{}], { continueOnFail: true });
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
    });
  });
});
