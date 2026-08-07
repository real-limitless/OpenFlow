import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.wekanTool";
const BASE = "https://wekan.example.com";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: new Map(Object.entries({ "content-type": "application/json" })),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string; method?: string; body?: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key, method: opts?.method, body: typeof opts?.body === "string" ? opts.body : undefined });
      if (!(key in routes)) {
        return mockJsonResponse({ error: "not found" }, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue wekanTool — n8n-nodes-base.wekanTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Wekan (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.wekanTool")).toBe(canonical);
  });

  describe("board resource", () => {
    it("board create returns board metadata", async () => {
      const fakeBoard = { _id: "board123", title: "Test Board", archived: false };
      installFetch({
        [`${BASE}/api/boards`]: fakeBoard,
      });
      const out = await runNode(
        TYPE,
        { resource: "board", operation: "create", title: "Test Board" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.title).toBe("Test Board");
      expect(out[0][0].json._id).toBe("board123");
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe(`${BASE}/api/boards`);
    });

    it("board get returns single board", async () => {
      const fakeBoard = { _id: "b1", title: "My Board" };
      installFetch({
        [`${BASE}/api/boards/b1`]: fakeBoard,
      });
      const out = await runNode(
        TYPE,
        { resource: "board", operation: "get", boardId: "b1" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json._id).toBe("b1");
      expect(calls).toHaveLength(1);
    });

    it("board delete passes through existing fields", async () => {
      installFetch({
        [`${BASE}/api/boards/b1`]: { _id: "b1", archived: true },
      });
      const out = await runNode(
        TYPE,
        { resource: "board", operation: "delete", boardId: "b1" },
        [{ json: { prevData: true } }],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.prevData).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
    });
  });

  describe("card resource", () => {
    it("card create with title and description", async () => {
      const fakeCard = { _id: "card1", title: "Urgent Task", description: "Created via n8n", boardId: "b1", listId: "l1" };
      installFetch({
        [`${BASE}/api/boards/b1/lists/l1/cards`]: fakeCard,
      });
      const out = await runNode(
        TYPE,
        { resource: "card", operation: "create", boardId: "b1", listId: "l1", title: "Urgent Task", description: "Created via n8n" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.title).toBe("Urgent Task");
      expect(out[0][0].json.description).toBe("Created via n8n");
      expect(calls).toHaveLength(1);
    });

    it("card delete returns deleted card", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards/card1`]: { _id: "card1", boardId: "b1" },
      });
      const out = await runNode(
        TYPE,
        { resource: "card", operation: "delete", boardId: "b1", cardId: "card1" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
    });

    it("card get returns card", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards/card1`]: { _id: "card1", title: "Test", boardId: "b1" },
      });
      const out = await runNode(
        TYPE,
        { resource: "card", operation: "get", boardId: "b1", cardId: "card1" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json._id).toBe("card1");
    });

    it("card getAll returns cards for board", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards`]: [{ _id: "c1", title: "Card 1", boardId: "b1" }],
      });
      const out = await runNode(
        TYPE,
        { resource: "card", operation: "getAll", boardId: "b1" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(calls).toHaveLength(1);
    });

    it("card getAll with multiple cards expands to multiple items", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards`]: [
          { _id: "c1", title: "Card 1", boardId: "b1" },
          { _id: "c2", title: "Card 2", boardId: "b1" },
        ],
      });
      const out = await runNode(
        TYPE,
        { resource: "card", operation: "getAll", boardId: "b1" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json._id).toBe("c1");
      expect(out[0][1].json._id).toBe("c2");
    });

    it("card update sends PUT with title", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards/card1`]: { _id: "card1", title: "Updated", boardId: "b1" },
      });
      const out = await runNode(
        TYPE,
        { resource: "card", operation: "update", boardId: "b1", cardId: "card1", title: "Updated" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json._id).toBe("card1");
      expect(calls[0].method).toBe("PUT");
    });
  });

  describe("cardComment resource", () => {
    it("cardComment create", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards/c1/comments`]: { _id: "cmt1", text: "Nice!" },
      });
      const out = await runNode(
        TYPE,
        { resource: "cardComment", operation: "create", boardId: "b1", cardId: "c1", authorId: "u1", comment: "Nice!" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
    });

    it("cardComment delete", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards/c1/comments/cmt1`]: { _id: "cmt1" },
      });
      const out = await runNode(
        TYPE,
        { resource: "cardComment", operation: "delete", boardId: "b1", cardId: "c1", commentId: "cmt1" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
    });
  });

  describe("checklist resource", () => {
    it("checklist create", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards/c1/checklists`]: { _id: "cl1", title: "To Do" },
      });
      const out = await runNode(
        TYPE,
        { resource: "checklist", operation: "create", boardId: "b1", cardId: "c1", title: "To Do" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json._id).toBe("cl1");
    });
  });

  describe("checklistItem resource", () => {
    it("checklistItem update sets isFinished", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards/c1/checklists/cl1/items/cli1`]: { _id: "cli1", isFinished: true },
      });
      const out = await runNode(
        TYPE,
        { resource: "checklistItem", operation: "update", boardId: "b1", cardId: "c1", checklistId: "cl1", checklistItemId: "cli1", isFinished: true },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.isFinished).toBe(true);
      expect(calls[0].method).toBe("PUT");
    });

    it("checklistItem delete", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/cards/c1/checklists/cl1/items/cli1`]: { _id: "cli1", isFinished: false },
      });
      const out = await runNode(
        TYPE,
        { resource: "checklistItem", operation: "delete", boardId: "b1", cardId: "c1", checklistId: "cl1", checklistItemId: "cli1" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
    });
  });

  describe("list resource", () => {
    it("list create", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/lists`]: { _id: "l1", title: "Backlog" },
      });
      const out = await runNode(
        TYPE,
        { resource: "list", operation: "create", boardId: "b1", title: "Backlog" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.title).toBe("Backlog");
    });

    it("list get returns single list", async () => {
      installFetch({
        [`${BASE}/api/boards/b1/lists/l1`]: { _id: "l1", title: "Done" },
      });
      const out = await runNode(
        TYPE,
        { resource: "list", operation: "get", boardId: "b1", listId: "l1" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json._id).toBe("l1");
    });
  });

  describe("error handling", () => {
    it("throws on missing credential", async () => {
      await expect(runNode(TYPE, { resource: "board", operation: "getAll" }, [{}])).rejects.toThrow();
    });

    it("continueOnFail returns error object", async () => {
      const out = await runNode(
        TYPE,
        { resource: "board", operation: "getAll" },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.error).toBeDefined();
    });

    it("throws on unknown resource", async () => {
      await expect(
        runNode(
          TYPE,
          { resource: "nonexistent", operation: "get" },
          [{}],
          { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
        ),
      ).rejects.toThrow("Unknown resource");
    });

    it("throws on 404 from API", async () => {
      installFetch({});
      await expect(
        runNode(
          TYPE,
          { resource: "board", operation: "get", boardId: "missing" },
          [{}],
          { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } } },
        ),
      ).rejects.toThrow("Wekan API error");
    });

    it("continueOnFail returns error json on 404", async () => {
      installFetch({});
      const out = await runNode(
        TYPE,
        { resource: "board", operation: "get", boardId: "missing" },
        [{}],
        { credentials: { wekanApi: { url: BASE, username: "admin", password: "pass" } }, continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.error).toBeDefined();
      expect(out[0][0].json.error).toContain("Wekan API error");
    });
  });
});
