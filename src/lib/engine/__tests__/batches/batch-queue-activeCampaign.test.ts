import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.activeCampaign";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
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
  body: string | undefined;
}

let calls: FetchCall[];

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({})) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return queue.shift() ?? mockResponse({});
  }));
}

function run(nodeParams: Record<string, unknown>, input: Array<Record<string, unknown>> = [{}], cred: Record<string, unknown> | null = { url: "https://example.api.com", apiKey: "test-key" }) {
  const node = makeNode({ name: "N", type: TYPE, parameters: nodeParams });
  const ctx = createExecutionContext({
    node,
    workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => input.map((j) => ({ json: j })),
    continueOnFail: false,
    getCredential: async () => cred,
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`no executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("batch-queue activeCampaign — n8n-nodes-base.activeCampaign", () => {
  beforeEach(() => { installFetch(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ActiveCampaign");
  });

  describe("contact — create", () => {
    it("sends POST to /api/3/contacts and returns the contact", async () => {
      installFetch(mockResponse({ contact: { id: 42, email: "test@example.com", firstName: "Jane", lastName: "Doe" } }));
      const out = await run({
        resource: "contact", operation: "create",
        email: "test@example.com", firstName: "Jane", lastName: "Doe",
      });
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        contact: { id: 42, email: "test@example.com", firstName: "Jane", lastName: "Doe" },
      });
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/3/contacts");
    });
  });

  describe("contact — update", () => {
    it("sends PUT to /api/3/contacts/:id", async () => {
      installFetch(mockResponse({ contact: { id: 1, lastName: "Smith" } }));
      const out = await run({
        resource: "contact", operation: "update",
        contactId: "1", lastName: "Smith",
      });
      expect(out[0][0].json).toMatchObject({ contact: { id: 1, lastName: "Smith" } });
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/api/3/contacts/1");
    });
  });

  describe("contact — getAll (paginated)", () => {
    it("sends GET with limit and returns contacts array + meta", async () => {
      installFetch(mockResponse({
        contacts: [{ id: 1, email: "a@b.com" }],
        meta: { total: 1, count: 1, offset: 0, limit: 10 },
      }));
      const out = await run({
        resource: "contact", operation: "getAll",
        returnAll: false, limit: 10,
      });
      expect(out[0][0].json).toMatchObject({
        contacts: [{ id: 1, email: "a@b.com" }],
        meta: { total: 1, count: 1, offset: 0, limit: 10 },
      });
      expect(calls[0].url).toContain("limit=10");
    });
  });

  describe("deal — createNote after create", () => {
    it("creates a note linked to a deal", async () => {
      installFetch([
        mockResponse({ deal: { id: 99, title: "Test Deal" } }),
        mockResponse({ note: { id: 5, note: "Follow up on Q1 proposal" } }),
      ]);
      const out1 = await run({
        resource: "deal", operation: "create",
        title: "Test Deal", contactId: "1", value: "1000", currency: "usd",
      });
      expect(out1[0][0].json).toMatchObject({ deal: { id: 99 } });

      const out2 = await run({
        resource: "deal", operation: "createNote",
        dealId: "99", note: "Follow up on Q1 proposal",
      });
      expect(out2[0][0].json).toMatchObject({ note: { id: 5, note: "Follow up on Q1 proposal" } });
      expect(calls[1].url).toContain("/api/3/notes");
    });
  });

  describe("continueOnFail", () => {
    it("returns error item when credential is missing", async () => {
      const node = makeNode({
        name: "N", type: TYPE,
        parameters: { resource: "contact", operation: "get", contactId: "99999" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { id: 99999 } }],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String) } });
    });
  });

  describe("list — getAll", () => {
    it("sends GET to /api/3/lists", async () => {
      installFetch(mockResponse({ lists: [{ id: "1", name: "My List" }], meta: { total: 1 } }));
      const out = await run({ resource: "list", operation: "getAll" });
      expect(out[0][0].json).toMatchObject({ lists: [{ id: "1", name: "My List" }], meta: { total: 1 } });
      expect(calls[0].url).toContain("/api/3/lists");
    });
  });

  describe("tag — create", () => {
    it("sends POST to /api/3/tags", async () => {
      installFetch(mockResponse({ tag: { id: 10, tag: "VIP", tagType: "contact" } }));
      const out = await run({ resource: "tag", operation: "create", name: "VIP", tagType: "contact" });
      expect(out[0][0].json).toMatchObject({ tag: { id: 10, tag: "VIP", tagType: "contact" } });
      expect(calls[0].method).toBe("POST");
    });
  });

  describe("contactList — add", () => {
    it("sends POST to /api/3/contactLists", async () => {
      installFetch(mockResponse({ contactList: { id: "1", contact: "42", list: "7" } }));
      const out = await run({ resource: "contactList", operation: "add", contactId: "42", listId: "7" });
      expect(out[0][0].json).toMatchObject({ contactList: { id: "1", contact: "42", list: "7" } });
    });
  });

  describe("contactTag — add", () => {
    it("sends POST to /api/3/contactTags", async () => {
      installFetch(mockResponse({ contactTag: { id: "99", contact: "42", tag: "10" } }));
      const out = await run({ resource: "contactTag", operation: "add", contactId: "42", tagId: "10" });
      expect(out[0][0].json).toMatchObject({ contactTag: { id: "99", contact: "42", tag: "10" } });
    });
  });

  describe("expression resolution via = prefix", () => {
    it("resolves = expression against item json", async () => {
      installFetch(mockResponse({ contact: { id: 1, email: "resolved@test.com" } }));
      const out = await run(
        { resource: "contact", operation: "get", contactId: "={{ $json.id }}" },
        [{ id: 1 }],
      );
      expect(out[0][0].json).toMatchObject({ contact: { id: 1 } });
    });
  });
});
