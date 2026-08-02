import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { NodeExecutor, ExecutionContext } from "@/sdk";
import { _clearPollStatesForTest } from "../../executors/google-sheets-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleSheetsTrigger";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function makeCtxWithCred(node: Parameters<typeof makeNode>[0], token: string, active = true): ExecutionContext {
  const n = makeNode(node);
  return {
    node: n,
    getParam: (name: string, def?: unknown) => {
      const val = (n.parameters as Record<string, unknown>)[name];
      return val !== undefined ? val : def;
    },
    getParams: () => n.parameters as Record<string, unknown>,
    getCredential: async () => ({ accessToken: token }),
    getInputItems: () => [],
    getNode: () => n,
    getWorkflow: () => ({ id: "test", name: "test", active, nodes: [n], connections: {}, settings: {} }),
    continueOnFail: () => false,
    evaluate: (expr: string) => expr,
    setCustomData: () => {},
    getCustomData: () => undefined,
    getAllCustomData: () => ({}),
    getNodeInputItems: () => [],
  } as unknown as ExecutionContext;
}

const defaultParams = {
  authentication: "triggerOAuth2",
  event: "rowAdded",
  documentId: { mode: "list", value: "spreadsheet123" },
  sheetName: { mode: "list", value: "Sheet1", cachedResultName: "Sheet1" },
  pollTimes: { item: [{ mode: "everyMinute" }] },
  options: {},
};

describe("googleSheetsTrigger", () => {
  beforeEach(() => {
    _clearPollStatesForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("returns empty output on first poll (no delta yet)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return mockResponse({
        range: "Sheet1!A1:C",
        values: [
          ["Name", "Email", "Company"],
          ["Alice", "alice@example.com", "Acme"],
          ["Bob", "bob@example.com", "Corp"],
        ],
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Sheets Trigger", type: TYPE, parameters: defaultParams });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result).toEqual([[]]);
  });

  it("emits one item when a row is added between polls (rowAdded)", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          range: "Sheet1!A1:C",
          values: [
            ["Name", "Email", "Company"],
            ["Alice", "alice@example.com", "Acme"],
          ],
        });
      }
      return mockResponse({
        range: "Sheet1!A1:C",
        values: [
          ["Name", "Email", "Company"],
          ["Alice", "alice@example.com", "Acme"],
          ["Carol", "carol@example.com", "Acme"],
        ],
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Sheets Trigger", type: TYPE, parameters: defaultParams });

    // First poll — seed state
    await executor(makeCtxWithCred(node, "test-token"), node);

    // Second poll — detect new row
    const result = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.Name).toBe("Carol");
    expect(result[0][0].json.Email).toBe("carol@example.com");
    expect(result[0][0].json.Company).toBe("Acme");
  });

  it("emits zero items on second consecutive poll with no changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return mockResponse({
        range: "Sheet1!A1:C",
        values: [
          ["Name", "Email", "Company"],
          ["Alice", "alice@example.com", "Acme"],
        ],
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Sheets Trigger", type: TYPE, parameters: defaultParams });

    await executor(makeCtxWithCred(node, "test-token"), node);
    const result = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result).toEqual([[]]);
  });

  it("emits multiple items for multiple rows added in one interval", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          range: "Sheet1!A1:C",
          values: [
            ["Name", "Email", "Company"],
            ["Alice", "alice@example.com", "Acme"],
          ],
        });
      }
      return mockResponse({
        range: "Sheet1!A1:C",
        values: [
          ["Name", "Email", "Company"],
          ["Alice", "alice@example.com", "Acme"],
          ["Carol", "carol@example.com", "Acme"],
          ["Dave", "dave@example.com", "Corp"],
        ],
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Sheets Trigger", type: TYPE, parameters: defaultParams });

    await executor(makeCtxWithCred(node, "test-token"), node);
    const result = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].json.Name).toBe("Carol");
    expect(result[0][1].json.Name).toBe("Dave");
  });

  it("emits an item for a row update (rowUpdate event)", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          range: "Sheet1!A1:C",
          values: [
            ["Name", "Email", "Company"],
            ["Alice", "alice@example.com", "Acme"],
          ],
        });
      }
      return mockResponse({
        range: "Sheet1!A1:C",
        values: [
          ["Name", "Email", "Company"],
          ["Alice", "alice@newdomain.com", "Acme"],
        ],
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({
      name: "Google Sheets Trigger",
      type: TYPE,
      parameters: { ...defaultParams, event: "rowUpdate" },
    });

    await executor(makeCtxWithCred(node, "test-token"), node);
    const result = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.Email).toBe("alice@newdomain.com");
    expect(result[0][0].json._changeType).toBe("rowUpdate");
    expect(result[0][0].json._rowNumber).toBeGreaterThanOrEqual(2);
  });

  it("emits items for both new and updated rows (anyUpdate event)", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          range: "Sheet1!A1:C",
          values: [
            ["Name", "Email", "Company"],
            ["Alice", "alice@example.com", "Acme"],
          ],
        });
      }
      return mockResponse({
        range: "Sheet1!A1:C",
        values: [
          ["Name", "Email", "Company"],
          ["Alice", "alice@new.com", "Acme"],
          ["Bob", "bob@example.com", "Corp"],
        ],
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({
      name: "Google Sheets Trigger",
      type: TYPE,
      parameters: { ...defaultParams, event: "anyUpdate" },
    });

    await executor(makeCtxWithCred(node, "test-token"), node);
    const result = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result[0]).toHaveLength(2);
  });

  it("throws on missing credential", async () => {
    const executor = getExecutor(TYPE) as NodeExecutor;
    const params = { ...defaultParams };
    const node = makeNode({ name: "GSTrigger", type: TYPE, parameters: params });
    const n = makeNode(node);
    const ctx = {
      node: n,
      getParam: (name: string, def?: unknown) => {
        const val = (n.parameters as Record<string, unknown>)[name];
        return val !== undefined ? val : def;
      },
      getParams: () => n.parameters as Record<string, unknown>,
      getCredential: async () => null,
      getInputItems: () => [],
      getNode: () => n,
      getWorkflow: () => ({ id: "test", name: "test", active: false, nodes: [n], connections: {}, settings: {} }),
      continueOnFail: () => false,
      evaluate: (expr: string) => expr,
      setCustomData: () => {},
      getCustomData: () => undefined,
      getAllCustomData: () => ({}),
      getNodeInputItems: () => [],
    } as unknown as ExecutionContext;

    await expect(executor(ctx, node)).rejects.toThrow("credential");
  });

  it("manual execution returns current visible rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return mockResponse({
        range: "Sheet1!A1:C",
        values: [
          ["Name", "Email", "Company"],
          ["Alice", "alice@example.com", "Acme"],
          ["Bob", "bob@example.com", "Corp"],
        ],
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({
      name: "Google Sheets Trigger",
      type: TYPE,
      parameters: { ...defaultParams, pollTimes: {} },
    });
    const n = makeNode(node);
    const ctx = {
      node: n,
      getParam: (name: string, def?: unknown) => {
        const val = (n.parameters as Record<string, unknown>)[name];
        return val !== undefined ? val : def;
      },
      getParams: () => n.parameters as Record<string, unknown>,
      getCredential: async () => ({ accessToken: "manual-token" }),
      getInputItems: () => [],
      getNode: () => n,
      getWorkflow: () => ({ id: "test", name: "test", active: false, nodes: [n], connections: {}, settings: {} }),
      continueOnFail: () => false,
      evaluate: (expr: string) => expr,
      setCustomData: () => {},
      getCustomData: () => undefined,
      getAllCustomData: () => ({}),
      getNodeInputItems: () => [],
    } as unknown as ExecutionContext;

    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].json.Name).toBe("Alice");
    expect(result[0][1].json.Name).toBe("Bob");
  });

  it("manual execution with empty sheet returns empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return mockResponse({
        range: "Sheet1!A1:C",
        values: [
          ["Name", "Email", "Company"],
        ],
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({
      name: "Google Sheets Trigger",
      type: TYPE,
      parameters: { ...defaultParams, pollTimes: {} },
    });
    const n = makeNode(node);
    const ctx = {
      node: n,
      getParam: (name: string, def?: unknown) => {
        const val = (n.parameters as Record<string, unknown>)[name];
        return val !== undefined ? val : def;
      },
      getParams: () => n.parameters as Record<string, unknown>,
      getCredential: async () => ({ accessToken: "manual-token" }),
      getInputItems: () => [],
      getNode: () => n,
      getWorkflow: () => ({ id: "test", name: "test", active: false, nodes: [n], connections: {}, settings: {} }),
      continueOnFail: () => false,
      evaluate: (expr: string) => expr,
      setCustomData: () => {},
      getCustomData: () => undefined,
      getAllCustomData: () => ({}),
      getNodeInputItems: () => [],
    } as unknown as ExecutionContext;

    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(0);
  });
});
