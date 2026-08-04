import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runNode, assertExecutorRegistered } from "../helpers";

const originalFetch = globalThis.fetch;

function mockFetch(response: unknown, status = 200) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(
      typeof response === "string" ? response : JSON.stringify(response),
    ),
    json: vi.fn().mockResolvedValue(response),
  });
}

function mockFetchWith(fn: (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>) {
  globalThis.fetch = vi.fn().mockImplementation(fn);
}

describe("microsoftToDoTool", () => {
  beforeEach(() => {
    assertExecutorRegistered("n8n-nodes-base.microsoftToDoTool");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("list resource", () => {
    it("creates a task list", async () => {
      const created = { id: "AAMkADkz...", displayName: "Shopping", wellknownListName: "Shopping" };
      mockFetch(created, 201);

      const [out] = await runNode(
        "n8n-nodes-base.microsoftToDoTool",
        { resource: "list", operation: "create", displayName: "Shopping" },
        [{ json: { listName: "Shopping" } }],
        { credentials: { microsoftToDoOAuth2Api: { accessToken: "mock-token" } } },
      );

      expect(out).toHaveLength(1);
      expect(out[0].json).toMatchObject({ id: "AAMkADkz...", displayName: "Shopping" });
    });

    it("gets a list", async () => {
      const got = { id: "list-1", displayName: "Work", wellknownListName: "Work" };
      mockFetch(got);

      const [out] = await runNode(
        "n8n-nodes-base.microsoftToDoTool",
        { resource: "list", operation: "get", listId: "list-1" },
        [{ json: {} }],
        { credentials: { microsoftToDoOAuth2Api: { accessToken: "mock-token" } } },
      );

      expect(out).toHaveLength(1);
      expect(out[0].json.displayName).toBe("Work");
    });

    it("gets all lists", async () => {
      const data = {
        value: [
          { id: "l1", displayName: "Work", wellknownListName: "Work" },
          { id: "l2", displayName: "Personal", wellknownListName: "Personal" },
        ],
      };
      mockFetch(data);

      const [out] = await runNode(
        "n8n-nodes-base.microsoftToDoTool",
        { resource: "list", operation: "getAll", returnAll: true },
        [{ json: {} }],
        { credentials: { microsoftToDoOAuth2Api: { accessToken: "mock-token" } } },
      );

      expect(out).toHaveLength(2);
      expect(out[0].json.displayName).toBe("Work");
      expect(out[1].json.displayName).toBe("Personal");
    });

    it("deletes a list and passes input through", async () => {
      mockFetch({}, 204);

      const [out] = await runNode(
        "n8n-nodes-base.microsoftToDoTool",
        { resource: "list", operation: "delete", listId: "list-1" },
        [{ json: { listId: "list-1" } }],
        { credentials: { microsoftToDoOAuth2Api: { accessToken: "mock-token" } } },
      );

      expect(out).toHaveLength(1);
      expect(out[0].json).toMatchObject({ listId: "list-1" });
    });

    it("updates a list", async () => {
      mockFetch({});
      mockFetch({ id: "list-1", displayName: "Updated", wellknownListName: "Updated" });

      const [out] = await runNode(
        "n8n-nodes-base.microsoftToDoTool",
        { resource: "list", operation: "update", listId: "list-1", displayName: "Updated" },
        [{ json: {} }],
        { credentials: { microsoftToDoOAuth2Api: { accessToken: "mock-token" } } },
      );

      expect(out).toHaveLength(1);
      expect(out[0].json.displayName).toBe("Updated");
    });
  });

  describe("task resource", () => {
    it("creates a task with due date and importance", async () => {
      const created = {
        id: "task-1",
        title: "Buy milk",
        dueDateTime: "2026-08-15T18:00:00Z",
        importance: "high",
        status: "notStarted",
        createdDateTime: "2026-08-04T12:00:00Z",
      };
      mockFetch(created, 201);

      const [out] = await runNode(
        "n8n-nodes-base.microsoftToDoTool",
        {
          resource: "task",
          operation: "create",
          listId: "AAMkADkz...",
          title: "Buy milk",
          dueDateTime: "2026-08-15T18:00:00Z",
          importance: "high",
        },
        [{ json: { listId: "AAMkADkz...", title: "Buy milk" } }],
        { credentials: { microsoftToDoOAuth2Api: { accessToken: "mock-token" } } },
      );

      expect(out).toHaveLength(1);
      expect(out[0].json.title).toBe("Buy milk");
      expect(out[0].json.importance).toBe("high");
      expect(out[0].json.status).toBe("notStarted");
    });

    it("gets all tasks in a list", async () => {
      const data = {
        value: [
          { id: "t1", title: "Task 1", status: "notStarted", createdDateTime: "2026-08-04T12:00:00Z" },
          { id: "t2", title: "Task 2", status: "inProgress", createdDateTime: "2026-08-04T13:00:00Z" },
        ],
      };
      mockFetch(data);

      const [out] = await runNode(
        "n8n-nodes-base.microsoftToDoTool",
        { resource: "task", operation: "getAll", listId: "AAMkADkz...", returnAll: true },
        [{ json: { listId: "AAMkADkz..." } }],
        { credentials: { microsoftToDoOAuth2Api: { accessToken: "mock-token" } } },
      );

      expect(out).toHaveLength(2);
      expect(out[0].json.title).toBe("Task 1");
      expect(out[1].json.title).toBe("Task 2");
    });
  });

  describe("error handling", () => {
    it("continueOnFail emits error item instead of throwing", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

      const [out] = await runNode(
        "n8n-nodes-base.microsoftToDoTool",
        { resource: "list", operation: "getAll", listId: "bad-id", continueOnFail: true },
        [{ json: { listId: "bad-id" } }],
        { continueOnFail: true, credentials: { microsoftToDoOAuth2Api: { accessToken: "mock-token" } } },
      );

      expect(out).toHaveLength(1);
      expect(out[0].json).toHaveProperty("error");
      expect(String(out[0].json.error)).toContain("Network failure");
    });
  });
});
