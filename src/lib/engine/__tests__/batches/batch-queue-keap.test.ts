import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.keap";

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
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

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
    calls.push({
      url: String(url),
      method: String(init?.method ?? "GET"),
      headers,
      body: init?.body ? String(init.body) : undefined,
    });
    const resp = responseQueue.shift() ?? mockResponse({});
    return resp;
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeCredNode(overrides: Record<string, unknown> = {}) {
  return makeNode({
    type: TYPE,
    parameters: { resource: "contact", operation: "upsert", ...overrides },
  });
}

async function runNode(parameters: Record<string, unknown>, inputItems: Array<Record<string, unknown>> = [{}]) {
  const executor = getExecutor(TYPE)!;
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const { createExecutionContext } = await import("@/sdk");
  const { makeWorkflow } = await import("../helpers");
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => inputItems.map((j) => ({ json: j })),
    continueOnFail: false,
    getCredential: async (name: string) => {
      if (name === "keapOAuth2Api") return { accessToken: "test-token" } as any;
      return null;
    },
  });
  return executor(ctx, node);
}

describe("Keap executor", () => {
  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has a node description", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
    expect(desc?.displayName).toBe("Keap");
  });

  describe("Contact", () => {
    it("upserts a contact", async () => {
      const created = { id: 123, given_name: "Alice", family_name: "Smith" };
      installFetch(mockResponse(created));

      const [out] = await runNode({
        resource: "contact",
        operation: "upsert",
        jsonParameters: JSON.stringify({ given_name: "Alice", family_name: "Smith" }),
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/contacts");
      expect(out).toHaveLength(1);
      expect(out[0].json).toMatchObject(created);
    });

    it("retrieves a contact by ID", async () => {
      const contact = { id: 123, given_name: "Alice", family_name: "Smith" };
      installFetch(mockResponse(contact));

      const [out] = await runNode({
        resource: "contact",
        operation: "retrieve",
        contactId: "123",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/contacts/123");
      expect(out[0].json).toMatchObject(contact);
    });

    it("deletes a contact", async () => {
      installFetch(mockResponse({}));

      const [out] = await runNode({
        resource: "contact",
        operation: "delete",
        contactId: "123",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/contacts/123");
    });

    it("lists contacts with pagination", async () => {
      const contacts = { records: [{ id: 1 }, { id: 2 }] };
      installFetch(mockResponse(contacts));

      const [out] = await runNode({
        resource: "contact",
        operation: "retrieveAll",
        limit: 10,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/contacts");
      expect(out).toHaveLength(2);
    });
  });

  describe("Contact Note", () => {
    it("creates a note on a contact", async () => {
      const note = { id: 456, body: "Follow up call completed", contact_id: 123 };
      installFetch(mockResponse(note));

      const [out] = await runNode({
        resource: "contactNote",
        operation: "create",
        contactId: "123",
        jsonParameters: JSON.stringify({ body: "Follow up call completed" }),
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/contacts/123/notes");
      expect(out[0].json).toMatchObject(note);
    });
  });

  describe("Contact Tag", () => {
    it("adds tags to a contact", async () => {
      const applied = { id: 789, tagIds: [1, 2, 3] };
      installFetch(mockResponse(applied));

      const [out] = await runNode({
        resource: "contactTag",
        operation: "addTags",
        contactId: "123",
        tagIds: "1,2,3",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/contacts/123/tags");
      const body = JSON.parse(calls[0].body!);
      expect(body.tagIds).toEqual(["1", "2", "3"]);
    });

    it("lists tags on a contact", async () => {
      installFetch(mockResponse({ records: [{ tag_id: 1 }, { tag_id: 2 }] }));

      const [out] = await runNode({
        resource: "contactTag",
        operation: "retrieveAll",
        contactId: "123",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/contacts/123/tags");
      expect(out).toHaveLength(2);
    });
  });

  describe("Company", () => {
    it("lists companies", async () => {
      const companies = { records: [{ id: 1, company_name: "Acme" }] };
      installFetch(mockResponse(companies));

      const [out] = await runNode({
        resource: "company",
        operation: "retrieveAll",
        limit: 10,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/companies");
      expect(out).toHaveLength(1);
    });
  });

  describe("Errors", () => {
    it("fails on invalid credentials", async () => {
      const executor = getExecutor(TYPE)!;
      const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "contact", operation: "upsert" } });
      const { createExecutionContext } = await import("@/sdk");
      const { makeWorkflow } = await import("../helpers");
      const ctx = createExecutionContext({
        node,
        workflow: makeWorkflow([node]),
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => null,
      });

      await expect(executor(ctx, node)).rejects.toThrow(/credential/i);
    });

    it("fails on API error", async () => {
      installFetch(mockResponse({ message: "Not found" }, { status: 404 }));

      await expect(
        runNode({
          resource: "contact",
          operation: "retrieve",
          contactId: "999",
        }),
      ).rejects.toThrow(/Not found/i);
    });
  });
});
