import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.emeliaTrigger";

const EMAIL_OPENED_PAYLOAD = {
  event: "emailOpened",
  campaignId: "cm_123",
  contact: { email: "prospect@example.com", name: "Jane Doe" },
  messageId: "<abc123@mail.example.com>",
  timestamp: "2026-08-04T12:00:00Z",
};

const EMAIL_BOUNCED_PAYLOAD = {
  event: "emailBounced",
  campaignId: "cm_456",
  contact: { email: "bad@example.com" },
  reason: "mailbox_full",
  timestamp: "2026-08-04T13:00:00Z",
};

const EMAIL_SENT_PAYLOAD = {
  event: "emailSent",
  campaignId: "cm_456",
  contact: { email: "good@example.com", name: "John Smith" },
  messageId: "<def456@mail.example.com>",
  timestamp: "2026-08-04T14:00:00Z",
};

describe("batch-queue emeliaTrigger — n8n-nodes-base.emeliaTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Emelia Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("emailOpened event passes through with full payload (Test 1)", async () => {
    const out = await runNode(
      TYPE,
      { events: ["emailOpened"], campaignId: "cm_123" },
      [EMAIL_OPENED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(EMAIL_OPENED_PAYLOAD);
  });

  it("filters out events not in the subscribed list", async () => {
    const out = await runNode(
      TYPE,
      { events: ["emailSent"], campaignId: "cm_456" },
      [EMAIL_OPENED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("multiple events — passes through matching events, filters others (Test 2)", async () => {
    const out = await runNode(
      TYPE,
      { events: ["emailSent", "emailBounced", "unsubscribedContact"], campaignId: "cm_456" },
      [EMAIL_SENT_PAYLOAD, EMAIL_BOUNCED_PAYLOAD, EMAIL_OPENED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.event).toBe("emailSent");
    expect(out[0][1].json.event).toBe("emailBounced");
  });

  it("empty input yields one empty item (trigger default)", async () => {
    const out = await runNode(TYPE, { events: ["emailOpened"], campaignId: "cm_123" }, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("passes through all payload fields as-is", async () => {
    const payload = {
      event: "linkClicked",
      campaignId: "cm_789",
      contact: { email: "clicker@example.com" },
      link: "https://example.com/offer",
      timestamp: "2026-08-04T15:00:00Z",
      extra_field: "should be preserved",
    };
    const out = await runNode(TYPE, { events: ["linkClicked"], campaignId: "cm_789" }, [payload]);
    expect(out[0][0].json).toEqual(payload);
  });
});
