import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.emelia";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      forEach() {},
      get() { return "application/json"; },
      entries() { return new Map(); },
    },
    async text() { return text; },
    async json() { return JSON.parse(text); },
  };
}

let calls: Array<{ url: string; method: string; body?: unknown }> = [];
function installFetch(response: ReturnType<typeof mockResponse>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    let body: unknown = undefined;
    if (init?.body) {
      try { body = JSON.parse(init.body as string); } catch { body = init.body; }
    }
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    return response;
  }));
}

const CREDS = { emeliaApi: { apiKey: "test-key-123" } };

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
  const ctx = createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => (inputItems as INodeExecutionData[]).map(i =>
      i && typeof i === "object" && "json" in i ? i as INodeExecutionData : { json: i as Record<string, unknown> }
    ),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => creds[name] ?? null,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(mockResponse({ id: "cmp_001", name: "Test Campaign" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue emelia — n8n-nodes-base.emelia", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Emelia");
  });

  it("campaign create", async () => {
    installFetch(mockResponse({ id: "cmp_001", name: "Q3 Outreach" }));
    const out = await run({ resource: "campaign", operation: "create", campaignName: "Q3 Outreach" });
    expect(out[0][0].json).toMatchObject({ id: "cmp_001", name: "Q3 Outreach" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/campaigns");
  });

  it("campaign get", async () => {
    installFetch(mockResponse({ id: "cmp_001", name: "Campaign" }));
    const out = await run({ resource: "campaign", operation: "get", campaignId: "cmp_001" });
    expect(out[0][0].json).toMatchObject({ id: "cmp_001" });
    expect(calls[0].url).toContain("/campaigns/cmp_001");
  });

  it("campaign get all (paginated)", async () => {
    installFetch(mockResponse({ data: [
      { id: "cmp_001", name: "Campaign 1" },
      { id: "cmp_002", name: "Campaign 2" },
    ]}));
    const out = await run({ resource: "campaign", operation: "getAll", returnAll: false, limit: 10 });
    expect(out[0]).toHaveLength(2);
    expect(calls[0].url).toContain("/campaigns?offset=0&limit=10");
  });

  it("campaign pause", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({ resource: "campaign", operation: "pause", campaignId: "cmp_001" });
    expect(out[0][0].json).toMatchObject({ success: true });
    expect(calls[0].url).toContain("/campaigns/cmp_001/pause");
    expect(calls[0].method).toBe("POST");
  });

  it("campaign start", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({ resource: "campaign", operation: "start", campaignId: "cmp_001" });
    expect(out[0][0].json).toMatchObject({ success: true });
    expect(calls[0].url).toContain("/campaigns/cmp_001/start");
  });

  it("campaign add contact", async () => {
    installFetch(mockResponse({ leadId: "lead_001", email: "user@example.com" }));
    const out = await run({
      resource: "campaign",
      operation: "addContact",
      campaignId: "cmp_001",
      contactEmail: "user@example.com",
    });
    expect(out[0][0].json).toMatchObject({ leadId: "lead_001", email: "user@example.com" });
    expect(calls[0].url).toContain("/campaigns/cmp_001/contacts");
    expect(calls[0].method).toBe("POST");
    expect((calls[0].body as Record<string, unknown>).email).toBe("user@example.com");
  });

  it("campaign add contact with expression", async () => {
    installFetch(mockResponse({ leadId: "lead_001", email: "lead@co.com" }));
    const out = await run(
      { resource: "campaign", operation: "addContact", campaignId: "cmp_001", contactEmail: "={{ $json.email }}" },
      [{ json: { email: "lead@co.com", company: "Acme" } }],
    );
    expect(out[0][0].json).toMatchObject({ leadId: "lead_001", email: "lead@co.com" });
    expect((calls[0].body as Record<string, unknown>).email).toBe("lead@co.com");
  });

  it("campaign duplicate with options", async () => {
    installFetch(mockResponse({ id: "cmp_002", name: "Copy of Q3 Outreach" }));
    const out = await run({
      resource: "campaign",
      operation: "duplicate",
      campaignId: "cmp_001",
      campaignName: "Copy of Q3 Outreach",
      options: { copyContacts: true, copyMails: true, copySettings: true },
    });
    expect(out[0][0].json).toMatchObject({ id: "cmp_002" });
    expect(calls[0].url).toContain("/campaigns/cmp_001/duplicate");
    const b = calls[0].body as Record<string, unknown>;
    expect(b.name).toBe("Copy of Q3 Outreach");
    expect(b.copy_contacts).toBe(true);
    expect(b.copy_mails).toBe(true);
    expect(b.copy_settings).toBe(true);
  });

  it("contact list add", async () => {
    installFetch(mockResponse({ leadId: "lead_001", email: "user@example.com" }));
    const out = await run({
      resource: "contactList",
      operation: "add",
      contactListId: "lst_abc123",
      contactEmail: "user@example.com",
      additionalFields: { firstName: "John", lastName: "Doe" },
    });
    expect(out[0][0].json).toMatchObject({ leadId: "lead_001", email: "user@example.com" });
    const b = calls[0].body as Record<string, unknown>;
    expect(b.email).toBe("user@example.com");
    expect(b.firstName).toBe("John");
    expect(b.lastName).toBe("Doe");
  });

  it("contact list get all", async () => {
    installFetch(mockResponse({ data: [{ id: "lst_001", name: "List 1" }] }));
    const out = await run({ resource: "contactList", operation: "getAll", returnAll: false, limit: 10 });
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("/contact-lists");
  });

  it("throws when credentials are missing", async () => {
    await expect(
      run({ resource: "campaign", operation: "create" }, [{}], { credentials: {} }),
    ).rejects.toThrow("Credential");
  });

  it("continue on fail yields error item", async () => {
    installFetch(mockResponse({ message: "Not found" }, 404));
    const out = await run(
      { resource: "campaign", operation: "get", campaignId: "bad_id" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });

  it("runs end-to-end in a workflow", async () => {
    installFetch(mockResponse({ id: "cmp_001", name: "Campaign" }));
    const node: INode = {
      id: "e1",
      name: "Emelia",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: { resource: "campaign", operation: "create", campaignName: "Test" },
      credentials: { emeliaApi: { name: "emeliaApi" } },
    };
    const wfCtx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key" }),
    });
    const executor = getExecutor(TYPE)!;
    const result = await executor(wfCtx, node);
    expect(result[0][0].json).toMatchObject({ id: "cmp_001" });
  });
});
