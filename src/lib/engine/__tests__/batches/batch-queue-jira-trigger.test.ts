import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.jiraTrigger";

const ISSUE_CREATED_PAYLOAD = {
  webhookEvent: "jira:issue_created",
  timestamp: 1715000000000,
  issue: { key: "TEST-42", fields: { summary: "Test issue created" } },
  user: { displayName: "Alice", accountId: "abc-123" },
};

const ISSUE_UPDATED_PAYLOAD = {
  webhookEvent: "jira:issue_updated",
  timestamp: 1715000001000,
  issue: { key: "TEST-43", fields: { summary: "Updated issue" } },
  user: { displayName: "Bob", accountId: "def-456" },
  changelog: {
    id: "12345",
    items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
  },
};

const COMMENT_CREATED_PAYLOAD = {
  webhookEvent: "comment_created",
  timestamp: 1715000002000,
  issue: { key: "TEST-44", fields: { summary: "Issue with comment" } },
  user: { displayName: "Charlie", accountId: "ghi-789" },
  comment: { id: "10000", body: "This is a comment" },
};

describe("batch-queue jiraTrigger — n8n-nodes-base.jiraTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Jira Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("issue created event forwarded as one item", async () => {
    const out = await runNode(
      TYPE,
      { events: ["jira:issue_created"] },
      [ISSUE_CREATED_PAYLOAD],
    );
    expect(out).toEqual([[{ json: ISSUE_CREATED_PAYLOAD }]]);
    const item = out[0][0];
    expect(item.json.webhookEvent).toBe("jira:issue_created");
    expect(item.json.issue.key).toBe("TEST-42");
    expect(item.json.issue.fields.summary).toBe("Test issue created");
    expect(item.json.user.displayName).toBe("Alice");
    expect(item.json.timestamp).toBe(1715000000000);
  });

  it("issue updated includes changelog", async () => {
    const out = await runNode(
      TYPE,
      { events: ["jira:issue_updated"] },
      [ISSUE_UPDATED_PAYLOAD],
    );
    expect(out).toEqual([[{ json: ISSUE_UPDATED_PAYLOAD }]]);
    const item = out[0][0];
    expect(item.json.webhookEvent).toBe("jira:issue_updated");
    expect(item.json.changelog.items).toHaveLength(1);
    expect(item.json.changelog.items[0].field).toBe("status");
    expect(item.json.changelog.items[0].fromString).toBe("To Do");
    expect(item.json.changelog.items[0].toString).toBe("In Progress");
  });

  it("comment event delivered correctly", async () => {
    const out = await runNode(
      TYPE,
      { events: ["comment_created"] },
      [COMMENT_CREATED_PAYLOAD],
    );
    expect(out).toEqual([[{ json: COMMENT_CREATED_PAYLOAD }]]);
    const item = out[0][0];
    expect(item.json.webhookEvent).toBe("comment_created");
    expect(item.json.comment.body).toBe("This is a comment");
    expect(item.json.issue.key).toBe("TEST-44");
    expect(item.json.user.displayName).toBe("Charlie");
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(TYPE, { events: ["jira:issue_created"] }, []);
    expect(out).toEqual([[]]);
  });
});
