import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.discourse";
const MOCK_CRED = {
  discourseApi: {
    apiKey: "test-key",
    url: "https://discourse.example.com",
    username: "system",
  },
};

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string; method?: string; body?: string }> = [];

function installFetch(status = 200) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = String(url);
      calls.push({
        url: key,
        method: (init?.method as string) ?? "GET",
        body: init?.body ? String(init.body) : undefined,
      });
      if (key.includes("posts.json") && !key.includes("admin")) {
        return mockJsonResponse(
          {
            id: 1,
            topic_id: 42,
            raw: "Test post",
            created_at: "2024-01-01T00:00:00Z",
          },
          status,
        );
      }
      if (key.includes("/posts/")) {
        return mockJsonResponse(
          {
            id: 1,
            topic_id: 42,
            raw: "Existing post",
            created_at: "2024-01-01T00:00:00Z",
          },
          status,
        );
      }
      if (key.includes("/categories.json")) {
        return mockJsonResponse(
          {
            category: { id: 1, name: "TestCategory", color: "FF0000", text_color: "FFFFFF" },
            category_list: { categories: [{ id: 1, name: "General", color: "0088CC" }] },
          },
          status,
        );
      }
      if (key.includes("/categories/")) {
        return mockJsonResponse(
          { category: { id: 1, name: "Updated", color: "00FF00", text_color: "000000" } },
          status,
        );
      }
      if (key.includes("/admin/groups.json")) {
        return mockJsonResponse({ basic_group: { id: 5, name: "TestGroup" } }, status);
      }
      if (key.includes("/groups/")) {
        return mockJsonResponse({ group: { id: 5, name: "TestGroup" } }, status);
      }
      if (key.includes("/groups.json")) {
        return mockJsonResponse({ groups: [{ id: 1, name: "Moderators" }] }, status);
      }

      if (key.includes("/admin/users/list/")) {
        return mockJsonResponse(
          [{ id: 1, username: "alice" }, { id: 2, username: "bob" }],
          status,
        );
      }
      if (key.includes("/u/by-external/")) {
        return mockJsonResponse({ id: 11, username: "extuser" }, status);
      }
      if (/\/users\/[a-zA-Z]/.test(key) && !key.includes("by-external")) {
        return mockJsonResponse({ id: 7, username: key.split("/").pop() }, status);
      }
      if (key.includes("/users.json")) {
        return mockJsonResponse({ id: 10, username: "newuser" }, status);
      }
      return mockJsonResponse(null, 404);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue discourse — n8n-nodes-base.discourse", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Discourse");
  });

  it("resolves the same executor under alias discourseTool", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("n8n-nodes-base.discourseTool")).toBe(canonical);
  });

  it("category create sends POST to /categories.json", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "category",
        operation: "create",
        name: "TestCategory",
        color: "FF0000",
        textColor: "FFFFFF",
      },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("TestCategory");
    expect(calls[0].url).toContain("/categories.json");
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.name).toBe("TestCategory");
    expect(body.color).toBe("FF0000");
    expect(body.text_color).toBe("FFFFFF");
  });

  it("post create with reply sends correct body", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "post",
        operation: "create",
        title: "Hello",
        content: "This is a test post.",
        additionalFields: { topic_id: "42", reply_to_post_number: "1" },
      },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.title).toBe("Hello");
    expect(body.raw).toBe("This is a test post.");
    expect(body.topic_id).toBe("42");
    expect(body.reply_to_post_number).toBe("1");
  });

  it("user getAll with flag and options builds correct URL", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "user",
        operation: "getAll",
        flag: "active",
        returnAll: false,
        limit: 25,
        options: { order: "username", asc: true, showEmails: true },
      },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    const url = calls[0].url;
    expect(url).toContain("/admin/users/list/active.json");
    expect(url).toContain("order=username");
    expect(url).toContain("asc=true");
    expect(url).toContain("show_emails=true");
    expect(out[0][0].json.users).toHaveLength(2);
  });

  it("userGroup add sends PUT to /groups/{id}/members.json", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "userGroup", operation: "add", usernames: "alice,bob", groupId: "5" },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("/groups/5/members.json");
    expect(calls[0].method).toBe("PUT");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.usernames).toBe("alice,bob");
  });

  it("userGroup remove sends DELETE to /groups/{id}/members.json", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "userGroup", operation: "remove", usernames: "charlie", groupId: "3" },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("/groups/3/members.json");
    expect(calls[0].method).toBe("DELETE");
  });

  it("group create sends POST to /admin/groups.json", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "group", operation: "create", name: "TestGroup" },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("/admin/groups.json");
    expect(calls[0].method).toBe("POST");
  });

  it("group get returns group by name", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "group", operation: "get", name: "TestGroup" },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("/groups/TestGroup");
  });

  it("user get by username returns user", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "user", operation: "get", by: "username", username: "alice" },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("/users/alice");
  });

  it("user get by externalId returns user", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "user", operation: "get", by: "externalId", externalId: "ext123" },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("/u/by-external/ext123.json");
  });

  it("post get by ID returns post", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "post", operation: "get", postId: "1" },
      [{}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("/posts/1");
  });

  it("continueOnFail with missing credential yields error item", async () => {
    installFetch();
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "post", operation: "get", postId: "1" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing required field without continueOnFail throws", async () => {
    installFetch();
    await expect(
      runNode(TYPE, { resource: "post", operation: "create" }, [{}], { credentials: MOCK_CRED }),
    ).rejects.toThrow(/content is required/i);
  });

  it("multi-item produces one output per input", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "category",
        operation: "create",
        name: "Test",
        color: "FF0000",
        textColor: "FFFFFF",
      },
      [{}, {}],
      { credentials: MOCK_CRED },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.name).toBe("TestCategory");
    expect(out[0][1].json.name).toBe("TestCategory");
    expect(calls).toHaveLength(2);
  });
});
