import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.helpScoutTrigger";

const CONVO_CREATED_PAYLOAD = {
  id: "evt-001",
  type: "convo.created",
  data: {
    item: {
      id: 12345,
      number: 678,
      preview: "Customer inquiry",
      mailboxId: 1,
      status: "active",
      subject: "Help needed",
      createdAt: "2026-01-01T00:00:00Z",
      modifiedAt: "2026-01-01T00:00:05Z",
      primaryCustomer: { id: 42, email: "cust@example.com" },
      assignee: { id: 7, firstName: "Agent", lastName: "User" },
      tags: [{ id: 1, tag: "support" }],
      _links: { self: { href: "https://api.helpscout.net/v2/conversations/12345" } },
    },
    mailbox: { id: 1, name: "Support" },
    customer: { id: 42, email: "cust@example.com" },
    assignee: { id: 7, firstName: "Agent", lastName: "User" },
    modifiedBy: { id: 7, firstName: "Agent", lastName: "User" },
  },
  timestamp: "2026-01-01T00:00:05Z",
  app: "help-scout",
  organization: "org-abc",
  account: "acct-xyz",
  _links: {
    self: { href: "https://api.helpscout.net/v2/conversations/12345" },
  },
};

const CONVO_STATUS_PAYLOAD = {
  id: "evt-002",
  type: "convo.status",
  data: {
    item: {
      id: 12346,
      number: 679,
      mailboxId: 1,
      status: "closed",
      subject: "Resolved",
    },
  },
  timestamp: "2026-01-01T01:00:00Z",
  app: "help-scout",
};

describe("batch-queue helpScoutTrigger — n8n-nodes-base.helpScoutTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Help Scout Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("emits matching webhook event payload", async () => {
    const out = await runNode(TYPE, { events: ["convo.created"] }, [CONVO_CREATED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(CONVO_CREATED_PAYLOAD);
    expect((out[0][0].json as Record<string, unknown>)._links).toBeDefined();
  });

  it("filters out non-matching events", async () => {
    const out = await runNode(TYPE, { events: ["convo.status"] }, [CONVO_CREATED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("emits only matching events when multiple events configured", async () => {
    const out = await runNode(
      TYPE,
      { events: ["convo.created", "convo.status"] },
      [CONVO_CREATED_PAYLOAD, CONVO_STATUS_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
  });

  it("allows all events when empty events list", async () => {
    const out = await runNode(TYPE, { events: [] }, [CONVO_CREATED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
  });

  it("skips items without a type field", async () => {
    const bad = { id: "no-type", data: {} };
    const out = await runNode(TYPE, { events: ["convo.created"] }, [bad as any]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("empty input emits a single empty item", async () => {
    const out = await runNode(TYPE, { events: ["convo.created"] }, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual([{ json: {} }]);
  });
});
