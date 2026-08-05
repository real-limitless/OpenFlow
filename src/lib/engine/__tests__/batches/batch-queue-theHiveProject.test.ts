import { describe, it, expect, beforeEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.theHiveProject";

function mockFetch(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

describe("batch-queue theHiveProject — n8n-nodes-base.theHiveProject", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("throws when credential is missing", async () => {
    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({ type: TYPE, parameters: { resource: "alert", operation: "Create" } });
    const ctx = makeCtx([{}], node);
    await expect(executor(ctx, node)).rejects.toThrow(/credential/i);
  });

  it("creates an alert via POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(201, { id: "~12345", title: "Test alert", severity: 2, type: "internal" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "alert",
        operation: "Create",
        body: JSON.stringify({ title: "Test alert", description: "Created by n8n", severity: 2, type: "internal" }),
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("alert");
    const alert = output[0].json.alert as Record<string, unknown>;
    expect(alert.title).toBe("Test alert");
    expect(alert.id).toBe("~12345");

    const callUrl = fetchMock.mock.calls[0][0];
    expect(callUrl).toContain("/api/v1/alert");
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("POST");
  });

  it("creates a case and returns it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(201, { id: "~case1", title: "New case", severity: 2 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "case",
        operation: "Create",
        body: JSON.stringify({ title: "New case", severity: 2 }),
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect((output[0].json.case as Record<string, unknown>)?.id).toBe("~case1");
  });

  it("promotes an alert to a case", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(201, { id: "~case1", title: "Promoted case", tags: ["n8n"] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "alert",
        operation: "Promote to Case",
        id: "={{ $json.alertId }}",
        body: JSON.stringify({ title: "Promoted case", tags: ["n8n"] }),
      },
    });
    const ctx = makeCtx([{ json: { alertId: "~123456" } }], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    const c = output[0].json.case as Record<string, unknown>;
    expect(c.id).toBe("~case1");
    expect(c.title).toBe("Promoted case");
  });

  it("searches cases via POST with body and returns multiple items", async () => {
    const cases = [
      { id: "~c1", title: "Case 1", status: "Open" },
      { id: "~c2", title: "Case 2", status: "Open" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, cases));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "case",
        operation: "Search",
        searchFilters: JSON.stringify({ status: "Open" }),
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(2);
    expect((output[0].json.case as Record<string, unknown>).id).toBe("~c1");
    expect((output[1].json.case as Record<string, unknown>).id).toBe("~c2");

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]?.method ?? "GET").toBe("POST");
    expect(callArgs[0]).toContain("/_search");
    const requestBody = JSON.parse(callArgs[1]?.body as string ?? "{}");
    expect(requestBody).toMatchObject({ status: "Open" });
  });

  it("searches with limit/offset/sort options", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, []));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "case",
        operation: "Search",
        searchFilters: JSON.stringify({ status: "Open" }),
        options: { limit: 10, offset: 5, sortBy: "title", sortOrder: "desc" },
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(0);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string ?? "{}");
    expect(requestBody).toMatchObject({ status: "Open", limit: 10, offset: 5, sort: "-title" });
  });

  it("executes a query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(200, [{ id: "~a1", title: "Alert 1" }])
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "query",
        operation: "Execute Query",
        query: JSON.stringify({ query: [{ _name: "listAlert" }] }),
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("query");
    const callUrl = fetchMock.mock.calls[0][0];
    expect(callUrl).toContain("/api/v1/query");
  });

  it("handles API error with continueOnFail — skips item on 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(404, { message: "Not found" }));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: { resource: "alert", operation: "Get", id: "nonexistent" },
    });
    const ctx = makeCtx([{}], node, true);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(0);
  });

  it("rethrows network error even when continueOnFail is true", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: { resource: "alert", operation: "Get", id: "test" },
    });
    const ctx = makeCtx([{}], node, true);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    await expect(executor(ctx, node)).rejects.toThrow();
  });

  it("adds attachment to case via multipart FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(201, { id: "~att1", name: "report.pdf" }));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "case",
        operation: "Add Attachment",
        id: "~case1",
        body: JSON.stringify({ description: "Evidence report" }),
      },
    });
    const ctx = makeCtx([{
      json: { caseId: "~case1" },
      binary: {
        attachment: {
          data: "dGVzdCBmaWxlIGNvbnRlbnQ=",
          mimeType: "application/pdf",
          fileName: "report.pdf",
        },
      },
    }], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect((output[0].json.case as Record<string, unknown>).id).toBe("~att1");

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toContain("/api/v1/case/~case1/attachments");
    expect(callArgs[1]?.method ?? "GET").toBe("POST");
    expect(callArgs[1]?.body).toBeInstanceOf(FormData);
  });
});
