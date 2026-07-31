import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftEntra";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get() {
        return null;
      },
      entries() {
        return new Map().entries();
      },
    },
    async json() {
      return text ? JSON.parse(text) : null;
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback = mockResponse({ ok: true }),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters,
    credentials: { microsoftEntraOAuth2Api: { name: "microsoftEntraOAuth2Api" } },
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { microsoftEntraOAuth2Api: { accessToken: "fake-token-123" } };

beforeEach(() => {
  installFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue microsoftEntra — n8n-nodes-base.microsoftEntra", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft Entra ID");
  });

  it("creates a group", async () => {
    const groupId = "g-123";
    installFetch({
      "POST https://graph.microsoft.com/v1.0/groups": mockResponse({
        id: groupId,
        displayName: "Engineering Team",
        mailNickname: "eng-team",
        groupTypes: ["Unified"],
        visibility: "Private",
        securityEnabled: true,
      }),
    });
    const out = await run({
      resource: "group",
      operation: "create",
      displayName: "Engineering Team",
      mailNickname: "eng-team",
      mailEnabled: false,
      securityEnabled: true,
      groupTypes: ["Unified"],
      visibility: "Private",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/groups");
    const body = JSON.parse(calls[0].body as string);
    expect(body.displayName).toBe("Engineering Team");
    expect(body.mailNickname).toBe("eng-team");
    expect(out[0][0].json).toMatchObject({ id: groupId, displayName: "Engineering Team" });
  });

  it("creates a user", async () => {
    const userId = "u-456";
    installFetch({
      "POST https://graph.microsoft.com/v1.0/users": mockResponse({
        id: userId,
        displayName: "Jane Doe",
        userPrincipalName: "jane.doe@example.com",
        accountEnabled: true,
      }),
    });
    const out = await run({
      resource: "user",
      operation: "create",
      accountEnabled: true,
      displayName: "Jane Doe",
      mailNickname: "jane.doe",
      userPrincipalName: "jane.doe@example.com",
      passwordProfile: {
        passwordProfileValues: { password: "TempP@ss123", forceChangePasswordNextSignIn: true },
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(calls[0].body as string);
    expect(body.displayName).toBe("Jane Doe");
    expect(body.passwordProfile).toBeDefined();
    expect(body.passwordProfile.password).toBe("TempP@ss123");
    expect(out[0][0].json).toMatchObject({ id: userId, displayName: "Jane Doe" });
  });

  it("adds user to group", async () => {
    installFetch({
      "POST https://graph.microsoft.com/v1.0/groups/g-999/members/$ref": mockResponse(null, 204),
    });
    const out = await run({
      resource: "user",
      operation: "addToGroup",
      groupId: "g-999",
      userId: "u-888",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/groups/g-999/members/$ref");
    const body = JSON.parse(calls[0].body as string);
    expect(body["@odata.id"]).toBe("https://graph.microsoft.com/v1.0/directoryObjects/u-888");
    expect(out[0][0].json).toEqual({});
  });

  it("removes user from group", async () => {
    installFetch({
      "DELETE https://graph.microsoft.com/v1.0/groups/g-999/members/u-888/$ref": mockResponse(
        null,
        204,
      ),
    });
    const out = await run({
      resource: "user",
      operation: "removeFromGroup",
      groupId: "g-999",
      userId: "u-888",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/groups/g-999/members/u-888/$ref");
    expect(out[0][0].json).toEqual({});
  });

  it("gets all groups", async () => {
    installFetch({
      "GET https://graph.microsoft.com/v1.0/groups": mockResponse({
        value: [
          { id: "g1", displayName: "Alpha" },
          { id: "g2", displayName: "Beta" },
        ],
      }),
    });
    const out = await run({ resource: "group", operation: "getAll", returnAll: true });
    expect(calls).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "g1", displayName: "Alpha" });
    expect(out[0][1].json).toMatchObject({ id: "g2", displayName: "Beta" });
  });

  it("gets all users with limit", async () => {
    installFetch({
      "GET https://graph.microsoft.com/v1.0/users": mockResponse({
        value: Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, displayName: `User ${i}` })),
      }),
    });
    const out = await run({ resource: "user", operation: "getAll", returnAll: false, limit: 3 });
    expect(out[0]).toHaveLength(3);
  });

  it("deletes a group", async () => {
    installFetch({
      "DELETE https://graph.microsoft.com/v1.0/groups/g-to-delete": mockResponse(null, 204),
    });
    const out = await run({ resource: "group", operation: "delete", groupId: "g-to-delete" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(out[0][0].json).toEqual({});
  });

  it("gets a single user", async () => {
    installFetch({
      "GET https://graph.microsoft.com/v1.0/users/u-single": mockResponse({
        id: "u-single",
        displayName: "Single User",
      }),
    });
    const out = await run({ resource: "user", operation: "get", userId: "u-single" });
    expect(calls).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "u-single", displayName: "Single User" });
  });

  it("updates a group", async () => {
    const groupId = "g-update";
    installFetch({
      [`PATCH https://graph.microsoft.com/v1.0/groups/${groupId}`]: mockResponse(null, 204),
      [`GET https://graph.microsoft.com/v1.0/groups/${groupId}`]: mockResponse({
        id: groupId,
        displayName: "Updated Team",
      }),
    });
    const out = await run({
      resource: "group",
      operation: "update",
      groupId,
      displayName: "Updated Team",
    });
    expect(calls).toHaveLength(2);
    const patchBody = JSON.parse(calls[0].body as string);
    expect(patchBody.displayName).toBe("Updated Team");
    expect(out[0][0].json).toMatchObject({ id: groupId, displayName: "Updated Team" });
  });

  it("handles API error with continueOnFail", async () => {
    installFetch({
      "GET https://graph.microsoft.com/v1.0/users/nonexistent": {
        status: 404,
        statusText: "Not Found",
        ok: false,
        headers: {
          get() {
            return "application/json";
          },
          entries() {
            return new Map().entries();
          },
        },
        async json() {
          return { message: "Resource not found" };
        },
        async text() {
          return '{"message":"Resource not found"}';
        },
      },
    });
    const out = await run({ resource: "user", operation: "get", userId: "nonexistent" }, [{}], {
      continueOnFail: true,
    });
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toHaveProperty("message");
  });
});
