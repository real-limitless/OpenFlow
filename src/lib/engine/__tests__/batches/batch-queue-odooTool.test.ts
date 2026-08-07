import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.odooTool";
const CREDS = {
  odooApi: {
    siteUrl: "https://my-odoo.example.com",
    database: "testdb",
    username: "admin",
    apiKey: "secret-key",
  },
};

interface RpcCall {
  service: string;
  method: string;
  args: unknown[];
}

let rpcCalls: RpcCall[] = [];
let rpcResponses: (result: unknown) => unknown = () => 1;

function mockJsonRpcResponse(result: unknown) {
  return {
    status: 200,
    ok: true,
    statusText: "OK",
    headers: new Map(),
    async json() {
      return { jsonrpc: "2.0", id: 1, result };
    },
    async text() {
      return JSON.stringify({ jsonrpc: "2.0", id: 1, result });
    },
  };
}

function installFetch(getResult: (call: RpcCall) => unknown) {
  rpcCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: { params?: { service?: string; method?: string; args?: unknown[] } } = {};
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = {};
        }
      }
      const params = body.params ?? {};
      const call: RpcCall = {
        service: String(params.service ?? ""),
        method: String(params.method ?? ""),
        args: (params.args as unknown[]) ?? [],
      };
      rpcCalls.push(call);
      return mockJsonRpcResponse(getResult(call));
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
    credentials: { odooApi: { name: "odooApi" } },
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
  rpcCalls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("odooTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create contact via tool", async () => {
    installFetch((call) => {
      if (call.method === "authenticate") return 1;
      if (call.method === "execute_kw") {
        const method = call.args[4];
        if (method === "create") return 42;
        if (method === "read") return [{ id: 42, name: "Alice", email: "alice@example.com" }];
      }
      return null;
    });
    const out = await run(
      {
        resource: "contact",
        operation: "create",
        fields: { name: "Alice", email: "alice@example.com" },
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ id: 42, name: "Alice" });
    const authCall = rpcCalls.find((c) => c.method === "authenticate");
    expect(authCall).toBeDefined();
    const createCall = rpcCalls.find((c) => c.method === "execute_kw" && c.args[4] === "create");
    expect(createCall).toBeDefined();
    expect((createCall!.args[5] as unknown[])[0]).toMatchObject({ name: "Alice", email: "alice@example.com" });
  });

  it("get all opportunities with limit", async () => {
    installFetch((call) => {
      if (call.method === "authenticate") return 1;
      if (call.method === "execute_kw") {
        return [
          { id: 1, name: "Opportunity A", expected_revenue: 10000 },
          { id: 2, name: "Opportunity B", expected_revenue: 25000 },
        ];
      }
      return null;
    });
    const out = await run(
      {
        resource: "opportunity",
        operation: "getAll",
        returnAll: false,
        limit: 3,
      },
      [{}],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: 1, name: "Opportunity A" });
    expect(out[0][1].json).toMatchObject({ id: 2, name: "Opportunity B" });
  });

  it("get contact by record identifier", async () => {
    installFetch((call) => {
      if (call.method === "authenticate") return 1;
      if (call.method === "execute_kw") {
        return [{ id: 5, name: "Bob", email: "bob@example.com" }];
      }
      return null;
    });
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        recordId: "5",
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ id: 5, name: "Bob" });
    const readCall = rpcCalls.filter((c) => c.method === "execute_kw" && c.args[4] === "read");
    expect(readCall).toHaveLength(1);
    expect(readCall[0].args[5]).toEqual([5]);
  });

  it("update contact", async () => {
    installFetch((call) => {
      if (call.method === "authenticate") return 1;
      if (call.method === "execute_kw") {
        const method = call.args[4];
        if (method === "write") return true;
        if (method === "read") return [{ id: 5, name: "Bob Updated" }];
      }
      return null;
    });
    const out = await run(
      {
        resource: "contact",
        operation: "update",
        recordId: "5",
        fields: { name: "Bob Updated" },
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ id: 5, name: "Bob Updated" });
  });

  it("delete contact", async () => {
    installFetch((call) => {
      if (call.method === "authenticate") return 1;
      if (call.method === "execute_kw") return true;
      return null;
    });
    const out = await run(
      {
        resource: "contact",
        operation: "delete",
        recordId: "42",
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ id: 42, success: true });
  });

  it("missing credential throws error", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { resource: "contact", operation: "create" },
    });
    const ctx: ExecutionContext = createExecutionContext({
      node,
      workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    await expect(getExecutor(TYPE)!(ctx, node)).rejects.toThrow("credential");
  });

  it("continueOnFail emits error item", async () => {
    installFetch((call) => {
      if (call.method === "authenticate") return false;
      if (call.method === "execute_kw") return null;
      return null;
    });
    const out = await run(
      { resource: "contact", operation: "get", recordId: "1" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.any(Object) });
  });
});