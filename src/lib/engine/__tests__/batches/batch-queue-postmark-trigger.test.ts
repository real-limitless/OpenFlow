import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.postmarkTrigger";

const BOUNCE_PAYLOAD = {
  RecordType: "Bounce",
  MessageStream: "outbound",
  MessageID: "883953f4-6105-42a2-a16a-77a8eac79483",
  Type: "HardBounce",
  TypeCode: 1,
  Email: "john@example.com",
  From: "sender@example.com",
  BouncedAt: "2025-01-01T00:00:00Z",
  Description: "The server was unable to deliver your message",
  Inactive: true,
  CanActivate: true,
};

const DELIVERY_PAYLOAD = {
  RecordType: "Delivery",
  MessageStream: "outbound",
  MessageID: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  Recipient: "alice@example.com",
  DeliveredAt: "2025-01-01T00:00:00Z",
  Details: "OK",
};

const OPEN_PAYLOAD = {
  RecordType: "Open",
  MessageStream: "outbound",
  MessageID: "x1y2z3-4567-8901-abcd-ef1234567890",
  Recipient: "bob@example.com",
  OpenedAt: "2025-01-01T00:00:05Z",
  FirstOpen: true,
  Geo: { CountryISOCode: "US", Country: "United States" },
  Client: { Name: "Chrome", Company: "Google", Family: "Browser" },
};

const SUBSEQUENT_OPEN_PAYLOAD = {
  ...OPEN_PAYLOAD,
  FirstOpen: false,
  OpenedAt: "2025-01-01T00:00:06Z",
};

const SPAM_COMPLAINT_PAYLOAD = {
  RecordType: "SpamComplaint",
  MessageStream: "outbound",
  MessageID: "c3d4e5f6-7890-abcd-ef12-345678901234",
  Email: "spamreporter@example.com",
  From: "sender@example.com",
  Description: "Spam complaint",
  Content: "<Full dump of spam complaint message>",
};

describe("batch-queue postmarkTrigger — n8n-nodes-base.postmarkTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Postmark Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("single event type — bounce payload passes through", async () => {
    const out = await runNode(TYPE, { events: ["bounce"] }, [BOUNCE_PAYLOAD]);
    expect(out).toEqual([[{ json: BOUNCE_PAYLOAD }]]);
  });

  it("multiple event types — delivery payload passes through", async () => {
    const out = await runNode(TYPE, { events: ["delivery", "open"] }, [DELIVERY_PAYLOAD]);
    expect(out).toEqual([[{ json: DELIVERY_PAYLOAD }]]);
  });

  it("firstOpen=true still emits the open event payload", async () => {
    const out = await runNode(TYPE, { events: ["open"], firstOpen: true }, [OPEN_PAYLOAD]);
    expect(out).toEqual([[{ json: OPEN_PAYLOAD }]]);
  });

  it("does not dedup subsequent opens client-side (FirstOpen: false still emitted)", async () => {
    const out = await runNode(TYPE, { events: ["open"], firstOpen: true }, [
      OPEN_PAYLOAD,
      SUBSEQUENT_OPEN_PAYLOAD,
    ]);
    expect(out).toEqual([[{ json: OPEN_PAYLOAD }, { json: SUBSEQUENT_OPEN_PAYLOAD }]]);
  });

  it("includeContent=true — spam complaint payload passes through", async () => {
    const out = await runNode(TYPE, { events: ["spamComplaint"], includeContent: true }, [
      SPAM_COMPLAINT_PAYLOAD,
    ]);
    expect(out).toEqual([[{ json: SPAM_COMPLAINT_PAYLOAD }]]);
  });

  it("invalid JSON body (no input items) yields an empty output (edge)", async () => {
    const out = await runNode(TYPE, { events: ["bounce"] }, []);
    expect(out).toEqual([[]]);
  });
});
