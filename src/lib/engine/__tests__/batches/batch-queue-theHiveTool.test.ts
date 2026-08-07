import { describe, it, expect, beforeEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.theHiveTool";

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

describe("batch-queue theHiveTool — n8n-nodes-base.theHiveTool", () => {
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
      mockFetch(201, { id: "~12345", title: "AI-discovered IOC", severity: 2, type: "internal" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "alert",
        operation: "Create",
        body: JSON.stringify({ title: "AI-discovered IOC", description: "Flagged by AI agent", severity: 2, type: "internal" }),
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
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("alert");
    const alert = output[0].json.alert as Record<string, unknown>;
    expect(alert.title).toBe("AI-discovered IOC");
    expect(alert.id).toBe("~12345");

    const callUrl = fetchMock.mock.calls[0][0];
    expect(callUrl).toContain("/api/v1/alert");
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("POST");
  });

  it("searches cases with pagination", async () => {
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
    expect(output.length).toBeLessThanOrEqual(10);
    for (const item of output) {
      expect(item.json).toHaveProperty("case");
      expect((item.json.case as Record<string, unknown>).id).toBeDefined();
    }
  });

  it("gets a single observable by ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(200, { id: "~123456", dataType: "ip", data: "8.8.8.8" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: { resource: "observable", operation: "Get", id: "~123456" },
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
    const obs = output[0].json.observable as Record<string, unknown>;
    expect(obs.id).toBe("~123456");
    expect(obs.dataType).toBe("ip");
  });

  it("updates a task status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(200, { id: "~task1", status: "Completed" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "task",
        operation: "Update",
        id: "~task1",
        body: JSON.stringify({ status: "Completed" }),
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
    expect(output).toHaveLength(1);
    const t = output[0].json.task as Record<string, unknown>;
    expect(t.status).toBe("Completed");
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
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("error");
  });
});
