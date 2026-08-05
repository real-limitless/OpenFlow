import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.asanaTool";

interface FetchCall { url: string; method: string; }

let calls: FetchCall[];

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return { status, statusText: status === 200 ? "OK" : status === 201 ? "Created" : "Error", ok: status >= 200 && status < 300, headers: { get() { return null; } }, async json() { return JSON.parse(text); }, async text() { return text; } };
}

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({})) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function runTool(parameters: Record<string, unknown>, inputItems: Array<Record<string, unknown>> = [{}], opts?: { continueOnFail?: boolean }) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = createExecutionContext({
    node, workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => inputItems.map((item) => ({ json: item })),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ accessToken: "test-token" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error("no executor");
  return executor(ctx, node).then((out) => ({ out, ctx }));
}

describe("batch-queue asanaTool — n8n-nodes-base.asanaTool", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Asana Tool");
  });

  describe("Task operations", () => {
    it("creates a task", async () => {
      installFetch(mockResponse({ data: { gid: "task-001", name: "Test task from n8n", resource_type: "task" } }, 201));
      const { out } = await runTool({ resource: "Task", operation: "Create", workspace: "ws-001", name: "Test task from n8n" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "task-001", name: "Test task from n8n", resource_type: "task" });
    });

    it("gets a task", async () => {
      installFetch(mockResponse({ data: { gid: "task-001", name: "Test task", resource_type: "task" } }));
      const { out } = await runTool({ resource: "Task", operation: "Get", task: "task-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "task-001", name: "Test task", resource_type: "task" });
    });

    it("gets all tasks in project", async () => {
      installFetch(mockResponse({ data: [{ gid: "task-001", name: "Task 1", resource_type: "task" }, { gid: "task-002", name: "Task 2", resource_type: "task" }] }));
      const { out } = await runTool({ resource: "Task", operation: "GetAll", project: "project-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(Array.isArray(out[0][0].json)).toBe(true);
      expect(out[0][0].json).toHaveLength(2);
    });

    it("deletes a task", async () => {
      installFetch(mockResponse({ data: { gid: "task-001", resource_type: "task", deleted: true } }));
      const { out } = await runTool({ resource: "Task", operation: "Delete", task: "task-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "task-001", deleted: true });
    });
  });

  describe("Project operations", () => {
    it("creates a project", async () => {
      installFetch(mockResponse({ data: { gid: "project-001", name: "Test project", resource_type: "project" } }, 201));
      const { out } = await runTool({ resource: "Project", operation: "Create", workspace: "ws-001", name: "Test project" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "project-001", name: "Test project", resource_type: "project" });
    });

    it("gets a project", async () => {
      installFetch(mockResponse({ data: { gid: "project-001", name: "Test project", resource_type: "project" } }));
      const { out } = await runTool({ resource: "Project", operation: "Get", project: "project-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });
  });

  describe("Error handling", () => {
    it("returns error item when continueOnFail is set and credential missing", async () => {
      const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "Task", operation: "Get" } });
      const ctx = createExecutionContext({
        node, workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({ httpCode: 500 });
    });
  });
});
