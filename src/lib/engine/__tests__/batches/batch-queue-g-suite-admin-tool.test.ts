import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gSuiteAdminTool";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  if (!map.has("content-type")) map.set("content-type", "application/json");
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

let calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string | undefined }>;
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch() {
  const orig = globalThis.fetch;
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;
    const headers: Record<string, string> = {};
    if (init?.headers && typeof init.headers === "object" && !Array.isArray(init.headers)) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k] = v;
      }
    }
    calls.push({
      url: urlStr,
      method: init?.method ?? "GET",
      headers,
      body: init?.body as string | undefined,
    });
    const resp = responseQueue.shift() ?? mockResponse({});
    return resp as Response;
  });
  return orig;
}

function makeCtx(
  params: Record<string, unknown> = {},
  items: Array<Record<string, unknown>> = [{}],
  credentials: Record<string, Record<string, unknown>> = {},
  continueOnFail = false,
): ExecutionContext {
  const node: INode = makeNode({
    type: TYPE,
    name: "GSuiteAdminTool",
    parameters: params,
  });
  const normalized: INodeExecutionData[] = items.map((item) => {
    if (item && typeof item === "object" && "json" in item) return item as unknown as INodeExecutionData;
    return { json: item as Record<string, unknown> };
  });
  return createExecutionContext({
    node,
    workflow: { id: "wf-test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => normalized,
    continueOnFail,
    getCredential: async (name: string) =>
      credentials[name] ?? { accessToken: "mock-token" },
  });
}

beforeEach(() => {
  responseQueue = [];
  installFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gSuiteAdminTool", () => {
  it("executor is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("definition exists", () => {
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.category).toBe("AI Tool");
  });

  it("user create returns simplified user", async () => {
    responseQueue.push(
      mockResponse({
        kind: "admin#directory#user",
        id: "user123",
        primaryEmail: "jane@example.com",
        name: { givenName: "Jane", familyName: "Doe", fullName: "Jane Doe" },
        isAdmin: false,
        suspended: false,
        creationTime: "2024-01-01T00:00:00.000Z",
      }),
    );

    const params = {
      resource: "user",
      operation: "create",
      firstName: "Jane",
      lastName: "Doe",
      password: "s3cret!",
      username: "jane",
      domain: "example.com",
    };

    const ctx = makeCtx(params);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, ctx.getNode());

    expect(output).toHaveLength(1);
    expect(output[0].json.primaryEmail).toBe("jane@example.com");
    expect((output[0].json.name as Record<string, unknown>).givenName).toBe("Jane");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/admin/directory/v1/users");
  });

  it("user get many with query returns simplified items", async () => {
    responseQueue.push(
      mockResponse({
        kind: "admin#directory#users",
        users: [
          {
            id: "u1",
            primaryEmail: "jane@example.com",
            name: { givenName: "Jane", familyName: "Doe", fullName: "Jane Doe" },
            isAdmin: false,
            suspended: false,
          },
          {
            id: "u2",
            primaryEmail: "john@example.com",
            name: { givenName: "John", familyName: "Smith", fullName: "John Smith" },
            isAdmin: true,
            suspended: false,
          },
        ],
      }),
    );

    const params = {
      resource: "user",
      operation: "getAll",
      returnAll: false,
      limit: 10,
      output: "simplified",
      projection: "basic",
    };

    const ctx = makeCtx(params);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, ctx.getNode());

    expect(output).toHaveLength(1);
    const json = output[0].json as Record<string, unknown>;
    const users = json.users as Array<Record<string, unknown>>;
    expect(users).toHaveLength(2);
    expect(users[0].primaryEmail).toBe("jane@example.com");
    expect(calls[0].url).toContain("/admin/directory/v1/users");
    expect(calls[0].url).toContain("maxResults=10");
  });

  it("group create returns group", async () => {
    responseQueue.push(
      mockResponse({
        kind: "admin#directory#group",
        id: "group123",
        email: "team@example.com",
        name: "Team",
        description: "Engineering team",
        directMembersCount: 5,
      }),
    );

    const params = {
      resource: "group",
      operation: "create",
      name: "Team",
      email: "team@example.com",
    };

    const ctx = makeCtx(params);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, ctx.getNode());

    expect(output).toHaveLength(1);
    expect(output[0].json.email).toBe("team@example.com");
    expect(output[0].json.name).toBe("Team");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/admin/directory/v1/groups");
  });

  it("device get many with basic projection", async () => {
    responseQueue.push(
      mockResponse({
        kind: "admin#directory#chromeosdevices",
        chromeosdevices: [
          {
            deviceId: "d1",
            serialNumber: "SN001",
            status: "ACTIVE",
            model: "Google Pixelbook",
          },
          {
            deviceId: "d2",
            serialNumber: "SN002",
            status: "ACTIVE",
            model: "Google Pixelbook",
          },
        ],
      }),
    );

    const params = {
      resource: "device",
      operation: "getAll",
      returnAll: false,
      limit: 5,
      projection: "basic",
      includeChildOrgunits: false,
    };

    const ctx = makeCtx(params);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, ctx.getNode());

    expect(output).toHaveLength(1);
    const json = output[0].json as Record<string, unknown>;
    const devices = json.chromeosdevices as Array<Record<string, unknown>>;
    expect(devices).toHaveLength(2);
    expect(devices[0].deviceId).toBe("d1");
    expect(devices[1].serialNumber).toBe("SN002");
    expect(calls[0].url).toContain("/customer/my_customer/devices/chromeos");
  });

  it("add user to group returns membership", async () => {
    responseQueue.push(
      mockResponse({
        kind: "admin#directory#member",
        id: "mem123",
        email: "jane@example.com",
        role: "MEMBER",
        type: "USER",
        status: "ACTIVE",
      }),
    );

    const params = {
      resource: "user",
      operation: "addToGroup",
      userId: { mode: "userEmail", value: "jane@example.com" },
      groupId: { mode: "groupId", value: "team@example.com" },
    };

    const ctx = makeCtx(params);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, ctx.getNode());

    expect(output).toHaveLength(1);
    expect((output[0].json as Record<string, unknown>).email).toBe("jane@example.com");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/groups/team%40example.com/members");
  });

  it("continueOnFail wraps errors", async () => {
    responseQueue.push(mockResponse({ error: { message: "not found" } }, { status: 404 }));

    const params = {
      resource: "user",
      operation: "get",
      userId: { mode: "userEmail", value: "missing@example.com" },
    };

    const ctx = makeCtx(params, [{}], {}, true);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, ctx.getNode());

    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("error");
    expect(String(output[0].json.error)).toContain("not found");
  });
});
