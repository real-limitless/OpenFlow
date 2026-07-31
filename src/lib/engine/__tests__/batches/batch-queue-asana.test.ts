import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.asana";

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

function runAsana(parameters: Record<string, unknown>, inputItems: Array<Record<string, unknown>> = [{}], opts?: { continueOnFail?: boolean }) {
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

describe("batch-queue asana — n8n-nodes-base.asana", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Asana");
  });

  describe("Task operations", () => {
    it("creates a task", async () => {
      installFetch(mockResponse({ data: { gid: "task-001", name: "Test task from n8n", notes: "Created by automated test", resource_type: "task" } }, 201));
      const { out } = await runAsana({ resource: "Task", operation: "Create", workspace: "ws-001", name: "Test task from n8n", options: { notes: "Created by automated test" } }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "task-001", name: "Test task from n8n", resource_type: "task" });
    });

    it("gets a task", async () => {
      installFetch(mockResponse({ data: { gid: "task-001", name: "Test task", resource_type: "task" } }));
      const { out } = await runAsana({ resource: "Task", operation: "Get", task: "task-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "task-001", name: "Test task", resource_type: "task" });
    });

    it("gets all tasks in project", async () => {
      installFetch(mockResponse({ data: [{ gid: "task-001", name: "Task 1", resource_type: "task" }, { gid: "task-002", name: "Task 2", resource_type: "task" }] }));
      const { out } = await runAsana({ resource: "Task", operation: "GetAll", project: "project-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(Array.isArray(out[0][0].json)).toBe(true);
      expect(out[0][0].json).toHaveLength(2);
    });

    it("searches tasks", async () => {
      installFetch(mockResponse({ data: [{ gid: "task-001", name: "Matched task", resource_type: "task" }] }));
      const { out } = await runAsana({ resource: "Task", operation: "Search", workspace: "ws-001", text: "test" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(Array.isArray(out[0][0].json)).toBe(true);
    });

    it("moves a task", async () => {
      installFetch([mockResponse({ data: {} }), mockResponse({ data: { gid: "task-001", resource_type: "task", projects: [{ gid: "project-002" }] } })]);
      const { out } = await runAsana({ resource: "Task", operation: "Move", task: "task-001", project: "project-002" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "task-001", resource_type: "task" });
    });

    it("updates a task", async () => {
      installFetch(mockResponse({ data: { gid: "task-001", name: "Updated task", resource_type: "task" } }));
      const { out } = await runAsana({ resource: "Task", operation: "Update", task: "task-001", name: "Updated task" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });

    it("deletes a task", async () => {
      installFetch(mockResponse({ data: { gid: "task-001", resource_type: "task", deleted: true } }));
      const { out } = await runAsana({ resource: "Task", operation: "Delete", task: "task-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "task-001", deleted: true });
    });
  });

  describe("Project operations", () => {
    it("creates a project", async () => {
      installFetch(mockResponse({ data: { gid: "project-001", name: "Test project", resource_type: "project" } }, 201));
      const { out } = await runAsana({ resource: "Project", operation: "Create", workspace: "ws-001", name: "Test project" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "project-001", name: "Test project", resource_type: "project" });
    });

    it("gets a project", async () => {
      installFetch(mockResponse({ data: { gid: "project-001", name: "Test project", resource_type: "project" } }));
      const { out } = await runAsana({ resource: "Project", operation: "Get", project: "project-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });

    it("gets all projects", async () => {
      installFetch(mockResponse({ data: [{ gid: "project-001", name: "Project 1", resource_type: "project" }, { gid: "project-002", name: "Project 2", resource_type: "project" }] }));
      const { out } = await runAsana({ resource: "Project", operation: "GetAll", workspace: "12345" }, [{ workspaceGid: "12345" }]);
      expect(out[0]).toHaveLength(1);
      const items = out[0][0].json as Record<string, unknown>[];
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty("gid");
      expect(items[0]).toHaveProperty("resource_type");
    });

    it("updates a project", async () => {
      installFetch(mockResponse({ data: { gid: "project-001", name: "Updated project", resource_type: "project" } }));
      const { out } = await runAsana({ resource: "Project", operation: "Update", project: "project-001", name: "Updated project" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });

    it("deletes a project", async () => {
      installFetch(mockResponse({ data: { gid: "project-001", resource_type: "project", deleted: true } }));
      const { out } = await runAsana({ resource: "Project", operation: "Delete", project: "project-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });
  });

  describe("Subtask operations", () => {
    it("creates a subtask", async () => {
      installFetch(mockResponse({ data: { gid: "subtask-001", name: "Subtask 1", resource_type: "task" } }, 201));
      const { out } = await runAsana({ resource: "Subtask", operation: "Create", task: "task-001", name: "Subtask 1" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });

    it("gets all subtasks", async () => {
      installFetch(mockResponse({ data: [{ gid: "subtask-001", name: "Subtask 1", resource_type: "task" }] }));
      const { out } = await runAsana({ resource: "Subtask", operation: "GetAll", task: "task-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(Array.isArray(out[0][0].json)).toBe(true);
    });
  });

  describe("Task Comment operations", () => {
    it("adds a comment", async () => {
      installFetch(mockResponse({ data: { gid: "story-001", text: "This is a test comment", resource_type: "story" } }, 201));
      const { out } = await runAsana({ resource: "Task Comment", operation: "Add", task: "12345", text: "This is a test comment" }, [{ taskGid: "12345", commentText: "This is a test comment" }]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ gid: "story-001", resource_type: "story" });
    });

    it("removes a comment", async () => {
      installFetch(mockResponse({ data: { gid: "story-001", resource_type: "story", deleted: true } }));
      const { out } = await runAsana({ resource: "Task Comment", operation: "Remove", task: "task-001", comment: "story-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });
  });

  describe("Task Tag operations", () => {
    it("adds a tag", async () => {
      installFetch(mockResponse({ data: {} }));
      const { out } = await runAsana({ resource: "Task Tag", operation: "Add", task: "task-001", tag: "tag-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });

    it("removes a tag", async () => {
      installFetch(mockResponse({ data: {} }));
      const { out } = await runAsana({ resource: "Task Tag", operation: "Remove", task: "task-001", tag: "tag-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });
  });

  describe("Task Project operations", () => {
    it("adds a project", async () => {
      installFetch(mockResponse({ data: {} }));
      const { out } = await runAsana({ resource: "Task Project", operation: "Add", task: "task-001", project: "project-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });

    it("removes a project", async () => {
      installFetch(mockResponse({ data: {} }));
      const { out } = await runAsana({ resource: "Task Project", operation: "Remove", task: "task-001", project: "project-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });
  });

  describe("User operations", () => {
    it("gets a user", async () => {
      installFetch(mockResponse({ data: { gid: "user-001", name: "User 1", email: "user1@example.com", resource_type: "user" } }));
      const { out } = await runAsana({ resource: "User", operation: "Get", user: "user-001" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });

    it("gets all users in workspace", async () => {
      installFetch(mockResponse({ data: [{ gid: "user-001", name: "User 1", email: "user1@example.com", resource_type: "user" }, { gid: "user-002", name: "User 2", email: "user2@example.com", resource_type: "user" }] }));
      const { out } = await runAsana({ resource: "User", operation: "GetAll", workspace: "12345" }, [{ workspaceGid: "12345" }]);
      expect(out[0]).toHaveLength(1);
      const items = out[0][0].json as Record<string, unknown>[];
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty("gid");
      expect(items[0]).toHaveProperty("email");
    });
  });

  describe("Error handling", () => {
    it("returns error item when continueOnFail is set and credential missing", async () => {
      const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "Task", operation: "Get" } as any });
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