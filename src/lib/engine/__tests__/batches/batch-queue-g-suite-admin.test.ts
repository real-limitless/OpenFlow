import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.gSuiteAdmin";
const CREDS = { gSuiteAdminOAuth2Api: { accessToken: "tok_admin" } };

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
  lastMethod = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      return handler(String(url), init?.method ?? "GET", body);
    }),
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
    credentials: { gSuiteAdminOAuth2Api: { name: "gSuiteAdminOAuth2Api" } },
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
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gSuiteAdmin executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("user create", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/users")) {
        const b = body as Record<string, unknown>;
        return mockResponse({
          kind: "admin#directory#user",
          id: "user-001",
          primaryEmail: b.primaryEmail,
          name: (b.name as Record<string, unknown>) ?? {},
          isAdmin: false,
          lastLoginTime: null,
          creationTime: new Date().toISOString(),
          suspended: false,
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "user",
      operation: "create",
      firstName: "Jane",
      lastName: "Doe",
      password: "TempPass123!",
      username: "jane.doe",
      domain: "example.com",
    });

    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as Record<string, unknown>;
    expect(result.primaryEmail).toBe("jane.doe@example.com");
    expect((result.name as Record<string, unknown>).givenName).toBe("Jane");
  });

  it("user get many with query", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/users")) {
        return mockResponse({
          users: [
            {
              kind: "admin#directory#user",
              id: "u1",
              primaryEmail: "jane@example.com",
              name: { familyName: "Doe", fullName: "Jane Doe", givenName: "Jane" },
              isAdmin: false,
              lastLoginTime: null,
              creationTime: "2024-01-01T00:00:00.000Z",
              suspended: false,
            },
            {
              kind: "admin#directory#user",
              id: "u2",
              primaryEmail: "john@example.com",
              name: { familyName: "Smith", fullName: "John Smith", givenName: "John" },
              isAdmin: false,
              lastLoginTime: null,
              creationTime: "2024-01-02T00:00:00.000Z",
              suspended: false,
            },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "user",
      operation: "getAll",
      returnAll: false,
      limit: 10,
      filter: { query: "name:Jane*" },
      output: "simplified",
      projection: "basic",
    });

    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as { users: Array<Record<string, unknown>> };
    expect(Array.isArray(result.users)).toBe(true);
    expect(result.users[0].primaryEmail).toBe("jane@example.com");
    expect(result.users[0].name).toBeDefined();
    expect(result.users[0].id).toBeDefined();
  });

  it("group create", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/groups")) {
        const b = body as Record<string, unknown>;
        return mockResponse({
          kind: "admin#directory#group",
          id: "group-001",
          email: b.email,
          name: b.name ?? "",
          description: b.description ?? "",
          adminCreated: true,
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "group",
      operation: "create",
      name: "Sales Team",
      email: "sales@example.com",
      additionalFields: { description: "Sales department group" },
    });

    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as Record<string, unknown>;
    expect(result.email).toBe("sales@example.com");
    expect(result.name).toBe("Sales Team");
  });

  it("add user to group", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/members")) {
        return mockResponse({
          kind: "admin#directory#member",
          email: "jane.doe@example.com",
          role: "MEMBER",
          id: "member-001",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "user",
      operation: "addToGroup",
      userId: { mode: "userEmail", value: "jane.doe@example.com" },
      groupId: { mode: "groupId", value: "0123kx3o1habcdf" },
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).not.toHaveProperty("error");
  });

  it("chromeos device get many", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/chromeos")) {
        return mockResponse({
          chromeosdevices: [
            {
              deviceId: "dev-001",
              serialNumber: "SN12345",
              status: "ACTIVE",
              model: "Samsung Galaxy Chromebook",
            },
            {
              deviceId: "dev-002",
              serialNumber: "SN67890",
              status: "ACTIVE",
              model: "Google Pixelbook",
            },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "device",
      operation: "getAll",
      returnAll: false,
      limit: 5,
      projection: "basic",
      includeChildOrgunits: false,
    });

    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as { chromeosdevices: Array<Record<string, unknown>> };
    expect(Array.isArray(result.chromeosdevices)).toBe(true);
    expect(result.chromeosdevices.length).toBe(2);
    expect(result.chromeosdevices[0].deviceId).toBe("dev-001");
    expect(result.chromeosdevices[0].serialNumber).toBe("SN12345");
  });

  it("continue on fail", async () => {
    installFetch(() => mockResponse({ error: { message: "User not found" } }, 404));

    const out = await run(
      {
        resource: "user",
        operation: "get",
        userId: { mode: "id", value: "nonexistent" },
        output: "simplified",
        projection: "basic",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("User not found") });
  });
});