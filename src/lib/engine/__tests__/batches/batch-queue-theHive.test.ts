import { describe, it, expect, beforeEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.theHive";

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

describe("batch-queue theHive — n8n-nodes-base.theHive", () => {
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
    // Patch credential
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      apiVersion: "theHive4",
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

  it("gets a single observable by ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(200, { id: "~123456", dataType: "ip", data: "8.8.8.8", message: "Test observable" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: { resource: "observable", operation: "Get", id: "={{ $json.observableId }}" },
    });
    const ctx = makeCtx([{ json: { observableId: "~123456" } }], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      apiVersion: "theHive4",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    const obs = output[0].json.observable as Record<string, unknown>;
    expect(obs.id).toBe("~123456");
    expect(obs.dataType).toBe("ip");
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
      apiVersion: "theHive4",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    const c = output[0].json.case as Record<string, unknown>;
    expect(c.id).toBe("~case1");
    expect(c.title).toBe("Promoted case");
  });

  it("updates a task status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(200, { id: "~789", status: "Completed" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "task",
        operation: "Update",
        id: "={{ $json.taskId }}",
        body: JSON.stringify({ status: "Completed" }),
      },
    });
    const ctx = makeCtx([{ json: { taskId: "~789" } }], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      apiVersion: "theHive4",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    const t = output[0].json.task as Record<string, unknown>;
    expect(t.status).toBe("Completed");
  });

  it("searches cases and returns multiple items", async () => {
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
      apiVersion: "theHive4",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(2);
    expect((output[0].json.case as Record<string, unknown>).id).toBe("~c1");
    expect((output[1].json.case as Record<string, unknown>).id).toBe("~c2");
  });

  it("handles API error with continueOnFail", async () => {
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
      apiVersion: "theHive4",
      ignoreSSLIssues: false,
    });

const [output] = await executor(ctx, node);
    // With continueOnFail, the failed item is emitted with an error field
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("error");
  });

  it("deletes an alert", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, { id: "~del", status: "Deleted" }));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: { resource: "alert", operation: "Delete", id: "~del" },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://thehive.example.com",
      apiKey: "test-key",
      apiVersion: "theHive4",
      ignoreSSLIssues: false,
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    const alert = output[0].json.alert as Record<string, unknown>;
    expect(alert.status).toBe("Deleted");
  });
});
