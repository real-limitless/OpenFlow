import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.airtableTrigger";

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

function installFetchSequence(responses: ReturnType<typeof mockResponse>[]) {
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => queue.shift() ?? mockResponse({})),
  );
}

const CREDS = { airtableApi: { accessToken: "pat_test_token" } };

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

describe("batch-queue airtableTrigger — n8n-nodes-base.airtableTrigger", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Airtable Trigger");
  });

  it("emits each record as a separate output item", async () => {
    installFetch(mockResponse({
      records: [
        { id: "rec1", fields: { Name: "A", Created: "2024-01-01T00:00:00Z" } },
        { id: "rec2", fields: { Name: "B", Created: "2024-01-02T00:00:00Z" } },
      ],
    }));

    const out = await run({ base: "app123", table: "tbl456", triggerField: "Created" });

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ Created: "2024-01-01T00:00:00Z", id: "rec1" });
    expect(out[0][1].json).toMatchObject({ Created: "2024-01-02T00:00:00Z", id: "rec2" });
  });

  it("filters fields when additionalFields.fields is specified", async () => {
    installFetch(mockResponse({
      records: [
        { id: "rec1", fields: { Name: "A", Status: "Active", Created: "2024-01-01T00:00:00Z", Notes: "extra" } },
      ],
    }));

    const out = await run({
      base: "app123",
      table: "tbl456",
      triggerField: "Created",
      additionalFields: { fields: "Name,Status" },
    });

    expect(out[0][0].json).toEqual({ Name: "A", Status: "Active", Created: "2024-01-01T00:00:00Z", id: "rec1" });
    expect(out[0][0].json).not.toHaveProperty("Notes");
  });

  it("returns only trigger field + id when fields omitted", async () => {
    installFetch(mockResponse({
      records: [
        { id: "rec1", fields: { Name: "Test", Status: "Active", Created: "2024-01-15T10:30:00Z", Notes: "extra" } },
      ],
    }));

    const out = await run({ base: "app123", table: "tbl456", triggerField: "Created" });

    expect(out[0][0].json).toEqual({ Created: "2024-01-15T10:30:00Z", id: "rec1" });
    expect(out[0][0].json).not.toHaveProperty("Name");
    expect(out[0][0].json).not.toHaveProperty("Status");
    expect(out[0][0].json).not.toHaveProperty("Notes");
  });

  it("includes last-poll timestamp filter when customData has _lastPollTimestamp", async () => {
    let fetchUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      fetchUrl = url;
      return Promise.resolve(mockResponse({ records: [] }));
    }));

    await run(
      { base: "app123", table: "tbl456", triggerField: "LastModified" },
      { _lastPollTimestamp: "2024-01-15 10:30:00" },
    );

    const decoded = decodeURIComponent(fetchUrl);
    expect(decoded).toContain("filterByFormula");
    expect(decoded).toContain("IS_AFTER({LastModified}");
    expect(decoded).toContain("DATETIME_PARSE");
    expect(decoded).toContain("2024-01-15 10:30:00");
  });

  it("combines last-poll filter with user formula via AND", async () => {
    let fetchUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      fetchUrl = url;
      return Promise.resolve(mockResponse({ records: [] }));
    }));

    await run(
      {
        base: "app123",
        table: "tbl456",
        triggerField: "LastModified",
        additionalFields: { formula: "{Status} = 'Active'" },
      },
      { _lastPollTimestamp: "2024-01-15 10:30:00" },
    );

    const decoded = decodeURIComponent(fetchUrl);
    expect(decoded).toContain("AND(");
    expect(decoded).toContain("IS_AFTER({LastModified}");
    expect(decoded).toContain("{Status} = 'Active'");
  });

  it("skips user formula on manual execution", async () => {
    let fetchUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      fetchUrl = url;
      return Promise.resolve(mockResponse({ records: [] }));
    }));

    await run(
      {
        base: "app123",
        table: "tbl456",
        triggerField: "Created",
        additionalFields: { formula: "{Status} = 'Active'" },
      },
      { _isManualExecution: "true" },
    );

    // filterByFormula should not contain the user formula on manual runs
    if (fetchUrl.includes("filterByFormula")) {
      expect(fetchUrl).not.toContain("{Status}");
    }
  });

  it("applies viewId parameter in query string", async () => {
    let fetchUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      fetchUrl = url;
      return Promise.resolve(mockResponse({ records: [] }));
    }));

    await run({
      base: "app123",
      table: "tbl456",
      triggerField: "Created",
      additionalFields: { viewId: "viwXXXXXXXXXXXXXX" },
    });

    expect(fetchUrl).toContain("view=viwXXXXXXXXXXXXXX");
  });

  it("sets fields[] query params when additionalFields.fields is provided", async () => {
    let fetchUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      fetchUrl = url;
      return Promise.resolve(mockResponse({ records: [] }));
    }));

    await run({
      base: "app123",
      table: "tbl456",
      triggerField: "Created",
      additionalFields: { fields: "Name,Status" },
    });

    expect(fetchUrl).toContain("fields%5B0%5D=Name");
    expect(fetchUrl).toContain("fields%5B1%5D=Status");
  });

  it("throws when base/table/triggerField are missing", async () => {
    await expect(run({})).rejects.toThrow("required");
  });

  it("returns empty array when no new records", async () => {
    installFetch(mockResponse({ records: [] }));
    const out = await run({ base: "app123", table: "tbl456", triggerField: "Created" });
    expect(out[0]).toHaveLength(0);
  });

  it("handles pagination via offset", async () => {
    installFetchSequence([
      mockResponse({
        records: [
          { id: "rec1", fields: { Name: "A", Created: "2024-01-01T00:00:00Z" } },
        ],
        offset: "nextPage",
      }),
      mockResponse({
        records: [
          { id: "rec2", fields: { Name: "B", Created: "2024-01-02T00:00:00Z" } },
        ],
      }),
    ]);

    const out = await run({ base: "app123", table: "tbl456", triggerField: "Created" });

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "rec1" });
    expect(out[0][1].json).toMatchObject({ id: "rec2" });
  });

  it("throws on non-2xx response", async () => {
    installFetch(mockResponse({ error: { type: "AUTHENTICATION_REQUIRED", message: "Invalid token" } }, 401));
    await expect(run({ base: "app123", table: "tbl456", triggerField: "Created" })).rejects.toThrow("Airtable");
  });

  it("sends fields[0]=triggerField when includedFields is not specified", async () => {
    let fetchUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      fetchUrl = url;
      return Promise.resolve(mockResponse({ records: [] }));
    }));

    await run({ base: "app123", table: "tbl456", triggerField: "Created" });

    expect(fetchUrl).toContain("fields%5B0%5D=Created");
  });

  it("persists _lastPollTimestamp after successful poll", async () => {
    installFetch(mockResponse({
      records: [
        { id: "rec1", fields: { Name: "A", Created: "2024-01-01T00:00:00Z" } },
      ],
    }));

    const customStore: Record<string, string> = {};
    const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters: { base: "app123", table: "tbl456", triggerField: "Created" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [],
      continueOnFail: false,
      getCredential: async (name) => CREDS[name] ?? null,
      customData: customStore,
    });
    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    const ts = customStore["_lastPollTimestamp"];
    expect(ts).toBeDefined();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("includes triggerField in fields[] when additionalFields.fields provided but missing triggerField", async () => {
    let fetchUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      fetchUrl = url;
      return Promise.resolve(mockResponse({ records: [] }));
    }));

    await run({
      base: "app123",
      table: "tbl456",
      triggerField: "Created",
      additionalFields: { fields: "Name,Status" },
    });

    expect(fetchUrl).toContain("fields%5B0%5D=Name");
    expect(fetchUrl).toContain("fields%5B1%5D=Status");
    expect(fetchUrl).toContain("fields%5B2%5D=Created");
  });

  it("includes downloadFields in fields[] when downloadAttachments enabled and no additionalFields.fields", async () => {
    let fetchUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      fetchUrl = url;
      return Promise.resolve(mockResponse({ records: [] }));
    }));

    await run({
      base: "app123",
      table: "tbl456",
      triggerField: "Created",
      downloadAttachments: true,
      downloadFields: "Documents",
    });

    expect(fetchUrl).toContain("fields%5B0%5D=Created");
    expect(fetchUrl).toContain("fields%5B1%5D=Documents");
  });

  it("downloads attachment and sets item.binary", async () => {
    const attachmentData = { url: "https://dl.airtable.com/att.pdf", filename: "doc.pdf" };
    let binaryUrl = "";

    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.startsWith("https://dl.airtable.com/")) {
        binaryUrl = url;
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: new Map([["content-type", "application/pdf"]]),
          arrayBuffer: () => Promise.resolve(new Uint8Array([37, 80, 68, 70]).buffer),
        } as unknown as Response);
      }
      return Promise.resolve(mockResponse({
        records: [
          {
            id: "rec1",
            fields: { Name: "A", Documents: [attachmentData], Created: "2024-01-01T00:00:00Z" },
          },
        ],
      }));
    }));

    const out = await run({
      base: "app123",
      table: "tbl456",
      triggerField: "Created",
      downloadAttachments: true,
      downloadFields: "Documents",
    });

    expect(binaryUrl).toBe("https://dl.airtable.com/att.pdf");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!.Documents).toBeDefined();
    expect(out[0][0].binary!.Documents.mimeType).toBe("application/pdf");
    expect(out[0][0].binary!.Documents.fileName).toBe("doc.pdf");
  });
});
