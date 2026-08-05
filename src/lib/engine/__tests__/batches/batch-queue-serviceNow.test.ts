import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.serviceNow";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Map([["content-type", "application/json"]]),
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
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

function installFetch(response: ReturnType<typeof mockResponse>) {
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
      return response;
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

const CREDS = {
  serviceNowBasicApi: { subdomain: "dev123456", user: "admin", password: "pass" },
};

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue serviceNow — n8n-nodes-base.serviceNow", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ServiceNow");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.serviceNow")).toBe(canonical);
  });

  describe("incident — create", () => {
    it("calls POST /table/incident and returns the created record (acceptance: incident create)", async () => {
      const created = {
        sys_id: "abc123",
        number: "INC0010001",
        short_description: "Test incident from n8n",
        impact: "2",
        urgency: "2",
        caller_id: "user-sys-id",
        sys_created_on: "2025-01-01T00:00:00Z",
      };

      installFetch(mockResponse({ result: created }));

      const out = await run({
        resource: "incident",
        operation: "create",
        shortDescription: "Test incident from n8n",
        callerId: "user-sys-id",
        impact: "2",
        urgency: "2",
      });

      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        sys_id: "abc123",
        number: "INC0010001",
        short_description: "Test incident from n8n",
        impact: "2",
        urgency: "2",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/now/table/incident");
      const sent = JSON.parse(calls[0].body ?? "{}");
      expect(sent.short_description).toBe("Test incident from n8n");
      expect(sent.impact).toBe("2");
    });
  });

  describe("incident — get all with limit", () => {
    it("returns limited items (acceptance: incident get all)", async () => {
      const records = Array.from({ length: 5 }, (_, i) => ({
        sys_id: `sysid-${i}`,
        number: `INC${String(i + 1).padStart(7, "0")}`,
        short_description: `Incident ${i + 1}`,
      }));

      installFetch(mockResponse({ result: records }));

      const out = await run({
        resource: "incident",
        operation: "getAll",
        returnAll: false,
        limit: 5,
      });

      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(5);
      for (const item of out[0]) {
        expect(item.json).toHaveProperty("sys_id");
        expect(item.json).toHaveProperty("number");
      }
      expect(calls[0].url).toContain("sysparm_limit=5");
    });
  });

  describe("user — get all", () => {
    it("returns user records (acceptance: user get all)", async () => {
      const users = [
        { sys_id: "u1", user_name: "alice", active: true },
        { sys_id: "u2", user_name: "bob", active: false },
      ];

      installFetch(mockResponse({ result: users }));

      const out = await run({
        resource: "user",
        operation: "getAll",
        returnAll: true,
      });

      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(2);
      for (const item of out[0]) {
        expect(item.json).toHaveProperty("sys_id");
        expect(item.json).toHaveProperty("user_name");
      }
      expect(calls[0].url).toContain("/api/now/table/sys_user");
    });
  });

  describe("business service — get all", () => {
    it("returns business service records (acceptance: business service)", async () => {
      const services = [
        { sys_id: "bs1", name: "Email Service" },
        { sys_id: "bs2", name: "DNS Service" },
      ];

      installFetch(mockResponse({ result: services }));

      const out = await run({
        resource: "businessService",
        operation: "getAll",
        returnAll: true,
      });

      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toHaveProperty("sys_id");
      expect(out[0][0].json).toHaveProperty("name");
      expect(calls[0].url).toContain("/api/now/table/cmdb_ci_service");
    });
  });

  describe("table record — create and get", () => {
    it("creates a record (acceptance: table record)", async () => {
      installFetch(
        mockResponse({
          result: { sys_id: "rec-001", short_description: "Test", description: "Hello" },
        }),
      );

      const out = await run({
        resource: "tableRecord",
        operation: "create",
        tableName: "incident",
        fields: { short_description: "Test", description: "Hello" },
      });

      expect(out).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        sys_id: "rec-001",
        short_description: "Test",
        description: "Hello",
      });
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/now/table/incident");
    });
  });

  describe("error handling", () => {
    it("emits error item when continueOnFail is true", async () => {
      installFetch(mockResponse({ error: "bad things" }, 401));

      const out = await run(
        { resource: "incident", operation: "create", shortDescription: "x" },
        [{}],
        { continueOnFail: true },
      );

      expect(out).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
    });

    it("throws on unknown resource", async () => {
      installFetch(mockResponse({}));

      await expect(
        run({ resource: "garbage", operation: "getAll" }),
      ).rejects.toThrow(/unsupported resource/);
    });
  });
});
