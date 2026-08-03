import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { _clearPollStateForTest } from "../../executors/n8n-nodes-base.notionTrigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.notionTrigger";

function mockResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json" } as Headers,
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body ?? {});
    },
  } as Response;
}

function installFetch(r: ReturnType<typeof mockResponse> = mockResponse({})) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
}

const CREDS = { notionApi: { accessToken: "ntn_test_token" } };

async function run(
  parameters: Record<string, unknown>,
  customData?: Record<string, string>,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters });
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => [],
    continueOnFail: false,
    getCredential: async (name) => CREDS[name] ?? null,
    customData: customData ? { ...customData } : undefined,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue notionTrigger — n8n-nodes-base.notionTrigger", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _clearPollStateForTest();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Notion Trigger");
  });

  it("emits newly created pages on first poll (manual execution)", async () => {
    installFetch(mockResponse({
      results: [
        {
          object: "page",
          id: "page-1",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T01:00:00.000Z",
          properties: {
            Name: { id: "title", type: "title", title: [{ plain_text: "Test Page" }] },
            Status: { id: "abcd", type: "select", select: { id: "opt1", name: "In Progress", color: "blue" } },
          },
          url: "https://www.notion.so/test-page-1",
        },
      ],
    }));

    const out = await run({
      events: ["pageAddedToDatabase"],
      databaseId: "test-db-id",
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json._event).toBe("pageAddedToDatabase");
    expect((out[0][0].json as Record<string, unknown>).id).toBe("page-1");
  });

  it("detects updated pages on subsequent polls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2024-01-01T00:00:00.000Z");

    installFetch(mockResponse({
      results: [
        {
          object: "page",
          id: "page-2",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T00:00:00.000Z",
          properties: {
            Name: { id: "title", type: "title", title: [{ plain_text: "Created Page" }] },
          },
          url: "https://www.notion.so/created-page-2",
        },
      ],
    }));

    const out1 = await run({
      events: ["pageUpdatedInDatabase"],
      databaseId: "test-db-id",
      pollingInterval: "everyMinute",
    });

    expect(out1[0]).toHaveLength(1);
    expect(out1[0][0].json._event).toBe("pageUpdatedInDatabase");

    vi.setSystemTime("2024-01-01T01:00:00.000Z");

    installFetch(mockResponse({
      results: [
        {
          object: "page",
          id: "page-3",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T00:30:00.000Z",
          properties: {
            Name: { id: "title", type: "title", title: [{ plain_text: "Updated Page" }] },
          },
          url: "https://www.notion.so/updated-page-3",
        },
      ],
    }));

    const out2 = await run({
      events: ["pageUpdatedInDatabase"],
      databaseId: "test-db-id",
      pollingInterval: "everyMinute",
    });

    expect(out2[0]).toHaveLength(1);
    expect(out2[0][0].json._event).toBe("pageUpdatedInDatabase");

    vi.useRealTimers();
  });

  it("returns empty on second poll when no new pages", async () => {
    installFetch(mockResponse({
      results: [
        {
          object: "page",
          id: "page-3",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T01:00:00.000Z",
          properties: {},
        },
      ],
    }));

    const out1 = await run({
      events: ["pageAddedToDatabase"],
      databaseId: "test-db-id",
    });
    expect(out1[0]).toHaveLength(1);

    installFetch(mockResponse({ results: [] }));

    const out2 = await run({
      events: ["pageAddedToDatabase"],
      databaseId: "test-db-id",
    });
    expect(out2[0]).toHaveLength(0);
  });

  it("applies simplifyOutput option", async () => {
    installFetch(mockResponse({
      results: [
        {
          object: "page",
          id: "page-simple",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T01:00:00.000Z",
          created_by: { object: "user", id: "user-1" },
          last_edited_by: { object: "user", id: "user-1" },
          parent: { type: "database_id", database_id: "db-1" },
          archived: false,
          properties: {
            Name: { id: "title", type: "title", title: [{ plain_text: "Simple" }] },
            Status: { id: "sel", type: "select", select: { id: "opt1", name: "Done", color: "green" } },
          },
          url: "https://www.notion.so/simple",
          public_url: null,
        },
      ],
    }));

    const out = await run({
      events: ["pageAddedToDatabase"],
      databaseId: "test-db-id",
      options: { simplifyOutput: true },
    });

    const json = out[0][0].json as Record<string, unknown>;
    expect(json.Name).toBe("Simple");
    expect(json.Status).toBe("Done");
    expect(json._event).toBe("pageAddedToDatabase");
    expect((json as { object?: unknown }).object).toBeUndefined();
    expect((json as { id?: unknown }).id).toBeUndefined();
  });

  it("emits both events when both selected", async () => {
    installFetch(mockResponse({
      results: [
        {
          object: "page",
          id: "page-both-a",
          created_time: "2024-01-02T12:00:00.000Z",
          last_edited_time: "2024-01-02T12:30:00.000Z",
          properties: { Name: { id: "title", type: "title", title: [{ plain_text: "New Page" }] } },
        },
      ],
    }));

    const out = await run({
      events: ["pageAddedToDatabase", "pageUpdatedInDatabase"],
      databaseId: "test-db-id",
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json._event).toBe("pageAddedToDatabase");
  });

  it("re-emits same page id with newer last_edited_time on second poll", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2024-01-01T00:00:00.000Z");

    installFetch(mockResponse({
      results: [
        {
          object: "page",
          id: "page-recurring",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T00:00:00.000Z",
          properties: { Name: { id: "title", type: "title", title: [{ plain_text: "V1" }] } },
        },
      ],
    }));

    const out1 = await run({
      events: ["pageUpdatedInDatabase"],
      databaseId: "test-db-id",
    });
    expect(out1[0]).toHaveLength(1);
    expect(out1[0][0].json._event).toBe("pageUpdatedInDatabase");

    vi.setSystemTime("2024-01-01T01:00:00.000Z");

    installFetch(mockResponse({
      results: [
        {
          object: "page",
          id: "page-recurring",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T01:00:00.000Z",
          properties: { Name: { id: "title", type: "title", title: [{ plain_text: "V2" }] } },
        },
      ],
    }));

    const out2 = await run({
      events: ["pageUpdatedInDatabase"],
      databaseId: "test-db-id",
    });
    expect(out2[0]).toHaveLength(1);
    expect(out2[0][0].json._event).toBe("pageUpdatedInDatabase");
    expect((out2[0][0].json as Record<string, unknown>).id).toBe("page-recurring");

    vi.useRealTimers();
  });

  it("uses options.filterJson override instead of timestamp filter", async () => {
    const filter = '{"property":"Status","select":{"equals":"Done"}}';

    let requestBody: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        requestBody = JSON.parse(String(init.body ?? "{}"));
        return mockResponse({ results: [] });
      }),
    );

    await run({
      events: ["pageAddedToDatabase"],
      databaseId: "test-db-id",
      options: { filterJson: filter },
    });

    expect(requestBody).toBeDefined();
    const body = requestBody as Record<string, unknown>;
    expect(body.filter).toEqual(JSON.parse(filter));
    expect((body.filter as Record<string, unknown>).timestamp).toBeUndefined();
  });

  it("throws when credential is missing", async () => {
    const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters: { databaseId: "x" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow("credential is required");
  });

  it("throws when databaseId is missing", async () => {
    const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters: {} });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [],
      continueOnFail: false,
      getCredential: async (name) => CREDS[name] ?? null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow("databaseId is required");
  });
});
