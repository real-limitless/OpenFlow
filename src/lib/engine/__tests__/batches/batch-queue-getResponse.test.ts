import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { seedBuiltinExecutors } from "../../index";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.getResponse";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get() { return "application/json"; },
      entries() { return new Map([["content-type", "application/json"]]).entries(); },
    },
    async json() { return text ? JSON.parse(text) : null; },
    async text() { return text; },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    mockResponse({}),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = {
    node,
    getInputItems: () =>
      inputItems.map((j) => ({ json: j, pairedItem: { item: 0, input: 0 } })),
    getParam: <T>(name: string, defaultVal?: T) =>
      (parameters[name] as T) ?? (defaultVal as T),
    getParams: () => parameters,
    continueOnFail: () => opts?.continueOnFail ?? false,
    getCredential: async (_name: string) => ({
      apiKey: "test-api-key",
    }),
    getNode: () => node,
    getWorkflow: () => ({
      id: "wf", name: "Test", active: false, nodes: [node],
      connections: {}, settings: {},
    }),
    evaluate: (expr: string) => expr,
    getNodeInputItems: () =>
      inputItems.map((j) => ({ json: j, pairedItem: { item: 0, input: 0 } })),
    setCustomData: () => {},
    getCustomData: () => undefined,
    getAllCustomData: () => ({}),
  };
  const executor = getExecutor(TYPE)!;
  return executor(ctx as any, node);
}

describe("batch-queue getResponse — n8n-nodes-base.getResponse", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("GetResponse");
  });

  it("creates a contact", async () => {
    const created = {
      contactId: "c123",
      email: "test@example.com",
      name: "Test User",
      campaign: { campaignId: "ABC123" },
      createdOn: "2024-01-01T00:00:00Z",
    };
    fetchMock.mockResolvedValue(mockResponse(created));

    const out = await run({
      resource: "Contact",
      operation: "Create",
      email: "test@example.com",
      campaignId: "ABC123",
      name: "Test User",
      dayOfCycle: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.getresponse.com/v3/contacts");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.email).toBe("test@example.com");
    expect(body.campaign.campaignId).toBe("ABC123");

    expect(out[0][0].json).toMatchObject({
      contactId: "c123",
      email: "test@example.com",
    });
  });

  it("gets a contact by contactId", async () => {
    const contact = {
      contactId: "c456",
      email: "existing@example.com",
      createdOn: "2024-01-01T00:00:00Z",
    };
    fetchMock.mockResolvedValue(mockResponse(contact));

    const out = await run({
      resource: "Contact",
      operation: "Get",
      contactId: "c456",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.getresponse.com/v3/contacts/c456",
    );
    expect(out[0][0].json).toMatchObject({
      contactId: "c456",
      email: "existing@example.com",
    });
  });

  it("gets all contacts with limit (bare array)", async () => {
    const contacts = Array.from({ length: 3 }, (_, i) => ({
      contactId: `c${i}`,
      email: `u${i}@example.com`,
    }));
    fetchMock.mockResolvedValue(mockResponse(contacts));

    const out = await run({
      resource: "Contact",
      operation: "GetAll",
      returnAll: false,
      limit: 50,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/contacts");
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toMatchObject({ contactId: "c0" });
  });

  it("gets all contacts with limit (wrapped object)", async () => {
    const contacts = Array.from({ length: 3 }, (_, i) => ({
      contactId: `c${i}`,
      email: `u${i}@example.com`,
    }));
    fetchMock.mockResolvedValue(mockResponse({ contacts }));

    const out = await run({
      resource: "Contact",
      operation: "GetAll",
      returnAll: false,
      limit: 50,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toMatchObject({ contactId: "c0" });
  });

  it("gets all contacts with returnAll pagination", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      contactId: `p1-c${i}`,
      email: `u${i}@example.com`,
    }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({
      contactId: `p2-c${i}`,
      email: `v${i}@example.com`,
    }));
    fetchMock
      .mockResolvedValueOnce(mockResponse(page1))
      .mockResolvedValueOnce(mockResponse(page2));

    const out = await run({
      resource: "Contact",
      operation: "GetAll",
      returnAll: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("page=1");
    expect(fetchMock.mock.calls[1][0]).toContain("page=2");
    expect(out[0]).toHaveLength(150);
  });

  it("updates a contact", async () => {
    const updated = {
      contactId: "c789",
      email: "update@example.com",
      name: "Updated Name",
    };
    fetchMock.mockResolvedValue(mockResponse(updated));

    const out = await run({
      resource: "Contact",
      operation: "Update",
      contactId: "c789",
      additionalFields: { name: "Updated Name" },
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.getresponse.com/v3/contacts/c789",
    );
    expect(out[0][0].json).toMatchObject({ name: "Updated Name" });
  });

  it("deletes a contact", async () => {
    fetchMock.mockResolvedValue(mockResponse(null, { status: 204 }));

    const out = await run({
      resource: "Contact",
      operation: "Delete",
      contactId: "c101",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.getresponse.com/v3/contacts/c101",
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("returns error items on continueOnFail", async () => {
    fetchMock.mockRejectedValue(new Error("API unavailable"));

    const out = await run(
      { resource: "Contact", operation: "Create", email: "fail@test.com", campaignId: "C1" },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toHaveProperty("error");
  });
});
