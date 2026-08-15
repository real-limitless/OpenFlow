import { describe, expect, it, vi } from "vitest";
import { reportRuntimeExecution } from "../report";

describe("reportRuntimeExecution", () => {
  it("POSTs runData and returns the execution id", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "ex-1", mode: "runtime", status: "success" }), {
        status: 201,
      });
    });
    const out = await reportRuntimeExecution({
      target: {
        url: "http://localhost:3000",
        token: "of_test",
        workflowId: "wf-1",
        host: "cleanflow",
        stageId: "orchestrate",
      },
      result: { success: true, runData: { Start: { status: "success" } } },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({ id: "ex-1" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [href, init] = fetchImpl.mock.calls[0]!;
    expect(href).toBe("http://localhost:3000/api/v1/workflows/wf-1/executions");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("PATCHes when executionId is set", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "ex-1", status: "success" }), { status: 200 });
    });
    await reportRuntimeExecution({
      target: { url: "http://localhost:3000/", token: "of_test", workflowId: "wf-1" },
      result: { success: true, runData: {} },
      executionId: "ex-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://localhost:3000/api/v1/executions/ex-1");
    expect((fetchImpl.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");
  });

  it("POSTs status running without finishedAt", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "ex-2", status: "running" }), { status: 201 });
    });
    await reportRuntimeExecution({
      target: { url: "http://localhost:3000", token: "of_test", workflowId: "wf-1" },
      result: { status: "running", runData: { Agent: { status: "running" } } },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse(String((fetchImpl.mock.calls[0]![1] as RequestInit).body));
    expect(body.status).toBe("running");
    expect(body.finishedAt).toBeUndefined();
  });

  it("returns null on network failure", async () => {
    const out = await reportRuntimeExecution({
      target: { url: "http://localhost:3000", token: "of_test", workflowId: "wf-1" },
      result: { success: true, runData: {} },
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    expect(out).toBeNull();
  });
});
