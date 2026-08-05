import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailchimpTrigger";

const SUBSCRIBE_PAYLOAD = {
  type: "subscribe",
  fired_at: "2009-03-26 21:35:57",
  data: {
    id: "8a25ff1d98",
    list_id: "a6b5da1054",
    email: "test@example.com",
    email_type: "html",
    merges: { EMAIL: "test@example.com", FNAME: "Test", LNAME: "User" },
  },
};

const UNSUBSCRIBE_PAYLOAD = {
  type: "unsubscribe",
  fired_at: "2009-03-26 21:40:57",
  data: {
    action: "unsub",
    reason: "manual",
    id: "8a25ff1d98",
    list_id: "a6b5da1054",
    email: "unsub@example.com",
    campaign_id: "cb398d21d2",
    merges: { EMAIL: "unsub@example.com" },
  },
};

function buildValidSignatureHeader(rawBody: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}${rawBody}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

describe("batch-queue mailchimpTrigger — n8n-nodes-base.mailchimpTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mailchimp Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("subscribe event — passes through parsed payload", async () => {
    const out = await runNode(
      TYPE,
      { events: ["subscribe"], listId: "a6b5da1054" },
      [SUBSCRIBE_PAYLOAD],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.type).toBe("subscribe");
    expect(out[0][0].json.data.email).toBe("test@example.com");
  });

  it("unsubscribe event — passes through parsed payload", async () => {
    const out = await runNode(
      TYPE,
      { events: ["unsubscribe"], listId: "a6b5da1054" },
      [UNSUBSCRIBE_PAYLOAD],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.type).toBe("unsubscribe");
    expect(out[0][0].json.data.action).toBe("unsub");
  });

  it("filters out events not in the selected event set", async () => {
    const out = await runNode(
      TYPE,
      { events: ["cleaned"], listId: "a6b5da1054" },
      [SUBSCRIBE_PAYLOAD],
    );
    expect(out[0]).toHaveLength(0);
  });

  it("no input items yields empty output", async () => {
    const out = await runNode(TYPE, { events: ["subscribe"], listId: "a6b5da1054" }, []);
    expect(out).toEqual([[]]);
  });

  it("signature verification — reject tampered payload", async () => {
    const payload = {
      ...SUBSCRIBE_PAYLOAD,
      _mailchimpSignature: "t=1234567890,v1=forged",
      _rawBody: JSON.stringify(SUBSCRIBE_PAYLOAD),
    };
    const out = await runNode(
      TYPE,
      { events: ["subscribe"], listId: "a6b5da1054", options: { secret: "test-secret" } },
      [payload],
    );
    expect(out[0]).toHaveLength(0);
  });

  it("signature verification — accept valid HMAC", async () => {
    const rawBody = JSON.stringify(SUBSCRIBE_PAYLOAD);
    const header = buildValidSignatureHeader(rawBody, "test-secret");
    const payload = {
      ...SUBSCRIBE_PAYLOAD,
      _mailchimpSignature: header,
      _rawBody: rawBody,
    };
    const out = await runNode(
      TYPE,
      { events: ["subscribe"], listId: "a6b5da1054", options: { secret: "test-secret" } },
      [payload],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.type).toBe("subscribe");
  });

  it("resolveEvents pools multiple events into one item", async () => {
    const out = await runNode(
      TYPE,
      {
        events: ["subscribe", "unsubscribe"],
        listId: "a6b5da1054",
        options: { resolveEvents: true },
      },
      [SUBSCRIBE_PAYLOAD, UNSUBSCRIBE_PAYLOAD],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.events).toHaveLength(2);
    expect(out[0][0].json.events[0].type).toBe("subscribe");
    expect(out[0][0].json.events[1].type).toBe("unsubscribe");
  });
});
