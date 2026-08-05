import { describe, it, expect, beforeEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.cortex";

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

describe("batch-queue cortex — n8n-nodes-base.cortex", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("throws when credential is missing", async () => {
    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({ type: TYPE, parameters: { resource: "analyzer", operation: "execute" } });
    const ctx = makeCtx([{}], node);
    await expect(executor(ctx, node)).rejects.toThrow(/credential/i);
  });

  it("executes an analyzer on an IP observable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(200, { status: "Success", job: { id: "~123", status: "Success" }, report: { summary: { taxonomies: [] } } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "analyzer",
        operation: "execute",
        analyzer: "Abuse_Finder_1_0",
        observableType: "ip",
        observableValue: "8.8.8.8",
        tlp: 2,
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://cortex.example.com",
      apiKey: "test-api-key",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("cortex");
    const result = output[0].json.cortex as Record<string, unknown>;
    expect(result.status).toBe("Success");

    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toContain("/api/analyzer/Abuse_Finder_1_0/run");
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("POST");
  });

  it("fetches a job report", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(200, { status: "Success", result: { data: { summary: "malicious" } }, artifact: { dataType: "ip" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "job",
        operation: "report",
        jobId: "01JABC1234567890",
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://cortex.example.com",
      apiKey: "test-api-key",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("cortex");

    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toContain("/api/job/01JABC1234567890/report");
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("GET");
  });

  it("executes a responder on a case", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetch(200, { status: "Success", responderId: "Block_IP_1_0" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "responder",
        operation: "execute",
        responder: "Block_IP_1_0",
        entityType: "case",
        jsonObject: false,
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://cortex.example.com",
      apiKey: "test-api-key",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("cortex");

    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toContain("/api/responder/Block_IP_1_0/run");
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("POST");
  });

  it("throws on missing jobId for job operation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "job",
        operation: "get",
        jobId: "",
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      url: "https://cortex.example.com",
      apiKey: "test-api-key",
    });

    await expect(executor(ctx, node)).rejects.toThrow(/jobId/);
  });
});
