import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.affinity";

function mockResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const ct = "application/json";
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "content-type") return ct;
        return null;
      },
      entries() { return new Map([["content-type", ct]]).entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall { url: string; method: string; headers: Record<string, string>; body: string | undefined; }

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({ url: String(url), method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? init.body : undefined });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

beforeEach(() => { installFetch(); });
afterEach(() => { vi.unstubAllGlobals(); });

async function runNode(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Affinity", type: TYPE, parameters: params });
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf-affinity",
      name: "Affinity Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () =>
      inputItems.map((item): INodeExecutionData =>
        item && typeof item === "object" && "json" in item
          ? (item as unknown as INodeExecutionData)
          : { json: item as Record<string, unknown> },
      ),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ apiKey: "test-key-123" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("n8n-nodes-base.affinity", () => {
  it("registers executor and node type", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE)).toBeTruthy();
  });

  // --- List ---

  it("list → getAll returns all lists", async () => {
    const mockLists = [{ id: 1, name: "My List" }, { id: 2, name: "Test List" }];
    installFetch(mockResponse(mockLists));
    const [out] = await runNode({ resource: "list", operation: "getAll" });
    expect(out).toHaveLength(2);
    expect((out[0].json as Record<string, unknown>).name).toBe("My List");
    expect(calls[0].url).toContain("api.affinity.co/lists");
  });

  it("list → get returns single list", async () => {
    const mockList = { id: 1, name: "My List", type: "static" };
    installFetch(mockResponse(mockList));
    const [out] = await runNode({ resource: "list", operation: "get", listId: 1 });
    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).name).toBe("My List");
    expect(calls[0].url).toContain("/lists/1");
  });

  // --- List Entry ---

  it("listEntry → create makes correct API call", async () => {
    const mockEntry = { id: 100, list_id: 5, entity_id: 42, entity_type: 1 };
    installFetch(mockResponse(mockEntry));
    const [out] = await runNode({ resource: "listEntry", operation: "create", listId: 5, entityId: 42, entityType: 1 });
    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).id).toBe(100);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/lists/5/list-entries");
    expect(calls[0].body).toContain('"entity_id"');
  });

  it("listEntry → delete returns empty object on 204", async () => {
    installFetch(mockResponse({}, { status: 204 }));
    const [out] = await runNode({ resource: "listEntry", operation: "delete", listId: 5, entryId: 99 });
    expect(out).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/lists/5/list-entries/99");
  });

  // --- Organization ---

  it("organization → create returns created org", async () => {
    const mockOrg = { id: 123, name: "Acme Corp", domain: "acme.example.com", domains: ["acme.example.com"], global: false };
    installFetch(mockResponse(mockOrg));
    const [out] = await runNode({
      resource: "organization",
      operation: "create",
      name: "Acme Corp",
      additionalFields: { domain: "acme.example.com" },
    });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.id).toBe(123);
    expect(json.name).toBe("Acme Corp");
    expect(json.domain).toBe("acme.example.com");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/organizations");
    expect(calls[0].body).toContain("acme.example.com");
  });

  it("organization → get returns single org", async () => {
    const mockOrg = { id: 123, name: "Acme Corp", domain: "acme.example.com" };
    installFetch(mockResponse(mockOrg));
    const [out] = await runNode({ resource: "organization", operation: "get", organizationId: 123 });
    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).id).toBe(123);
    expect(calls[0].url).toContain("/organizations/123");
  });

  it("organization → getAll with limit", async () => {
    const mockOrgs = [{ id: 1, name: "Org A" }, { id: 2, name: "Org B" }];
    installFetch(mockResponse(mockOrgs));
    const [out] = await runNode({ resource: "organization", operation: "getAll", returnAll: false, limit: 10 });
    expect(out).toHaveLength(2);
    expect(calls[0].url).toContain("limit=10");
    expect(calls[0].url).toContain("/organizations");
  });

  // --- Person ---

  it("person → getAll with pagination", async () => {
    const mockPersons = [{ id: 1, first_name: "John", last_name: "Doe", emails: ["john@example.com"] }];
    installFetch(mockResponse(mockPersons));
    const [out] = await runNode({ resource: "person", operation: "getAll", returnAll: false, limit: 10 });
    expect(out).toHaveLength(1);
    const p = out[0].json as Record<string, unknown>;
    expect(p.id).toBe(1);
    expect(p.first_name).toBe("John");
    expect(calls[0].url).toContain("/persons");
  });

  it("person → create returns created person", async () => {
    const mockPerson = { id: 456, first_name: "Jane", last_name: "Smith", emails: ["jane@example.com"] };
    installFetch(mockResponse(mockPerson));
    const [out] = await runNode({
      resource: "person",
      operation: "create",
      firstName: "Jane",
      lastName: "Smith",
    });
    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).id).toBe(456);
    expect((out[0].json as Record<string, unknown>).first_name).toBe("Jane");
    expect(calls[0].body).toContain("first_name");
    expect(calls[0].body).toContain("last_name");
  });

  // --- Errors ---

  it("throws on missing required parameters", async () => {
    await expect(runNode({ resource: "organization", operation: "create" }))
      .rejects.toThrow("name is required");
  });

  it("API error propagates", async () => {
    installFetch(mockResponse({ error: "Not Found" }, { status: 404 }));
    await expect(runNode({ resource: "list", operation: "get", listId: 999 }))
      .rejects.toThrow("Not Found");
  });

  it("continueOnFail suppresses error", async () => {
    installFetch([
      mockResponse({ error: "Not Found" }, { status: 404 }),
      mockResponse({ lists: [{ id: 1, name: "OK" }] }),
    ]);
    const [out] = await runNode(
      { resource: "list", operation: "getAll" },
      [{ listId: 999 }, {}],
      { continueOnFail: true },
    );
    expect(out).toHaveLength(2);
    expect((out[0].json as Record<string, unknown>).error).toBeTruthy();
    expect((out[1].json as Record<string, unknown>).name).toBe("OK");
  });
});
