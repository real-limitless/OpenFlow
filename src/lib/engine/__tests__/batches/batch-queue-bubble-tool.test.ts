import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.bubbleTool";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(
  response: ReturnType<typeof mockResponse> = mockResponse({ _id: "abc123" }),
) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return nextResponse;
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
}

async function runTest(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  credential?: Record<string, unknown>,
): Promise<{ out: INodeExecutionData[][]; calls: FetchCall[] }> {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  const node = makeNode({ name: "BubbleTool", type: TYPE, parameters: params });
  const ctx = createExecutionContext({
    node,
    workflow: { id: "wf-1", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => toItems(inputItems),
    continueOnFail: false,
    getCredential: async () => credential ?? null,
  });
  const out = await executor(ctx, node);
  return { out, calls: calls ?? [] };
}

describe("batch-queue bubble-tool — n8n-nodes-base.bubbleTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    calls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
  });

  describe("Create", () => {
    it("sends POST to /api/1.1/obj/{typeName} and returns created object", async () => {
      const created = { _id: "new_obj_1", name: "Studio Apartment", price: 1200 };
      installFetch(mockResponse(created));

      const { out, calls: fetchedCalls } = await runTest(
        {
          resource: "object",
          operation: "create",
          typeName: "rentalunit",
          fields: JSON.stringify({ name: "Studio Apartment", price: 1200 }),
        },
        [{}],
        { apiToken: "test-token", appName: "myapp", environment: "Development" },
      );

      expect(fetchedCalls).toHaveLength(1);
      expect(fetchedCalls[0].method).toBe("POST");
      expect(fetchedCalls[0].url).toContain("/api/1.1/obj/rentalunit");
      expect(fetchedCalls[0].body).toBe(JSON.stringify({ name: "Studio Apartment", price: 1200 }));

      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json._id).toBe("new_obj_1");
      expect(out[0][0].json.name).toBe("Studio Apartment");
    });
  });

  describe("Get", () => {
    it("sends GET request with objectId and returns the object", async () => {
      const obj = { _id: "12345abcdef", name: "Studio Apartment" };
      installFetch(mockResponse(obj));

      const { out, calls: fetchedCalls } = await runTest(
        {
          resource: "object",
          operation: "get",
          typeName: "rentalunit",
          objectId: "12345abcdef",
        },
        [{}],
        { apiToken: "test-token", appName: "myapp", environment: "Development" },
      );

      expect(fetchedCalls).toHaveLength(1);
      expect(fetchedCalls[0].method).toBe("GET");
      expect(fetchedCalls[0].url).toContain("/api/1.1/obj/rentalunit/12345abcdef");

      expect(out[0][0].json._id).toBe("12345abcdef");
    });
  });

  describe("Get All", () => {
    it("sends GET request with limit param and returns response", async () => {
      const apiResponse = {
        response: [
          { _id: "1", name: "Unit A" },
          { _id: "2", name: "Unit B" },
        ],
        count: 2,
      };
      installFetch(mockResponse(apiResponse));

      const { out, calls: fetchedCalls } = await runTest(
        {
          resource: "object",
          operation: "getAll",
          typeName: "rentalunit",
          returnAll: false,
          limit: 10,
        },
        [{}],
        { apiToken: "test-token", appName: "myapp", environment: "Development" },
      );

      expect(fetchedCalls).toHaveLength(1);
      expect(fetchedCalls[0].method).toBe("GET");
      expect(fetchedCalls[0].url).toContain("/api/1.1/obj/rentalunit?limit=10");

      expect(out[0][0].json.response).toBeDefined();
      expect(out[0][0].json.response).toHaveLength(2);
    });
  });

  describe("Update", () => {
    it("sends PUT request with fields and returns updated object", async () => {
      const updated = { _id: "12345abcdef", name: "Studio Apartment", price: 1500 };
      installFetch(mockResponse(updated));

      const { out, calls: fetchedCalls } = await runTest(
        {
          resource: "object",
          operation: "update",
          typeName: "rentalunit",
          objectId: "12345abcdef",
          fields: JSON.stringify({ price: 1500 }),
        },
        [{}],
        { apiToken: "test-token", appName: "myapp", environment: "Development" },
      );

      expect(fetchedCalls).toHaveLength(1);
      expect(fetchedCalls[0].method).toBe("PUT");
      expect(fetchedCalls[0].url).toContain("/api/1.1/obj/rentalunit/12345abcdef");
      expect(fetchedCalls[0].body).toBe(JSON.stringify({ price: 1500 }));

      expect(out[0][0].json.price).toBe(1500);
    });
  });

  describe("Delete", () => {
    it("sends DELETE request and returns success", async () => {
      installFetch(mockResponse({ status: "success" }));

      const { out, calls: fetchedCalls } = await runTest(
        {
          resource: "object",
          operation: "delete",
          typeName: "rentalunit",
          objectId: "12345abcdef",
        },
        [{}],
        { apiToken: "test-token", appName: "myapp", environment: "Development" },
      );

      expect(fetchedCalls).toHaveLength(1);
      expect(fetchedCalls[0].method).toBe("DELETE");
      expect(fetchedCalls[0].url).toContain("/api/1.1/obj/rentalunit/12345abcdef");

      expect(out[0][0].json.success).toBe(true);
    });
  });

  describe("Error handling", () => {
    it("throws when credential is missing", async () => {
      installFetch(mockResponse({}));

      const node = makeNode({
        name: "BubbleTool",
        type: TYPE,
        parameters: {
          resource: "object",
          operation: "get",
          typeName: "rentalunit",
          objectId: "12345abcdef",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "wf-1", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => toItems([{}]),
        continueOnFail: false,
        getCredential: async () => null,
      });

      await expect(getExecutor(TYPE)!(ctx, node)).rejects.toThrow(/credential/i);
    });

    it("throws on API error", async () => {
      installFetch(mockResponse({ message: "Type not found" }, { status: 404 }));

      await expect(
        runTest(
          {
            resource: "object",
            operation: "get",
            typeName: "nonexistent",
            objectId: "123",
          },
          [{}],
          { apiToken: "test-token", appName: "myapp", environment: "Development" },
        ),
      ).rejects.toThrow();
    });
  });
});
