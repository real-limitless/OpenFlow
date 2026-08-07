import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailerLiteTrigger";

const SUBSCRIBER_CREATED_PAYLOAD = {
  id: "100000000000000000",
  email: "john.doe@example.com",
  status: "active",
  source: "ecommerce",
  fields: { name: "", last_name: "" },
  event: "subscriber.created",
  account_id: 0,
};

const GROUP_PAYLOAD = {
  type: "subscriber.added_to_group",
  subscriber: { id: "1", email: "a@b.com" },
  group: { id: "10", name: "Newsletter" },
};

const CAMPAIGN_SENT_PAYLOAD = {
  id: "42",
  name: "Weekly Digest",
  total_recipients: 1500,
  preview_url: "https://mailerlite.com/campaign/42/preview",
  date: "2024-01-15T10:00:00Z",
  event: "campaign.sent",
  account_id: 1,
};

const BATCHED_CLICK_PAYLOAD = {
  events: [
    {
      type: "campaign.click",
      subscriber: { id: "1", email: "a@b.com" },
      campaign: { id: "42", name: "Weekly" },
      link_url: "https://example.com/link1",
    },
    {
      type: "campaign.click",
      subscriber: { id: "2", email: "c@d.com" },
      campaign: { id: "42", name: "Weekly" },
      link_url: "https://example.com/link2",
    },
  ],
  total: 2,
};

const BOUNCED_V1_PAYLOAD = {
  id: "99",
  email: "bounce@example.com",
  status: "bounced",
  event: "subscriber.bounced",
  account_id: 0,
};

describe("batch-queue mailerLiteTrigger — n8n-nodes-base.mailerLiteTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MailerLite Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("V2 subscriber.created webhook", async () => {
    const out = await runNode(
      TYPE,
      { events: ["subscriber.created"] },
      [SUBSCRIBER_CREATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(SUBSCRIBER_CREATED_PAYLOAD);
  });

  it("V2 subscriber.added_to_group webhook", async () => {
    const out = await runNode(
      TYPE,
      { events: ["subscriber.added_to_group"] },
      [GROUP_PAYLOAD],
    );
    expect(out[0][0].json).toHaveProperty("type", "subscriber.added_to_group");
    expect((out[0][0].json as Record<string, unknown>).subscriber).toMatchObject({ id: "1", email: "a@b.com" });
    expect((out[0][0].json as Record<string, unknown>).group).toMatchObject({ id: "10", name: "Newsletter" });
  });

  it("V2 campaign.sent webhook", async () => {
    const out = await runNode(
      TYPE,
      { events: ["campaign.sent"] },
      [CAMPAIGN_SENT_PAYLOAD],
    );
    expect(out[0][0].json).toHaveProperty("event", "campaign.sent");
    expect((out[0][0].json as Record<string, unknown>).name).toBe("Weekly Digest");
    expect((out[0][0].json as Record<string, unknown>).total_recipients).toBe(1500);
  });

  it("V2 batchable campaign.click webhook", async () => {
    const out = await runNode(
      TYPE,
      { events: ["campaign.click"] },
      [BATCHED_CLICK_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect((out[0][0].json as Record<string, unknown>).type).toBe("campaign.click");
    expect((out[0][0].json as Record<string, unknown>).link_url).toBe("https://example.com/link1");
    expect((out[0][1].json as Record<string, unknown>).link_url).toBe("https://example.com/link2");
  });

  it("V1 subscriber.bounced webhook", async () => {
    const out = await runNode(
      TYPE,
      { events: ["subscriber.bounced"] },
      [BOUNCED_V1_PAYLOAD],
    );
    expect(out[0][0].json).toHaveProperty("event", "subscriber.bounced");
    expect((out[0][0].json as Record<string, unknown>).id).toBe("99");
    expect((out[0][0].json as Record<string, unknown>).email).toBe("bounce@example.com");
  });

  it("filters out non-matching events", async () => {
    const out = await runNode(
      TYPE,
      { events: ["campaign.open"] },
      [SUBSCRIBER_CREATED_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("wraps events field when batchable payload given with empty filter", async () => {
    const out = await runNode(TYPE, {}, [BATCHED_CLICK_PAYLOAD]);
    expect(out[0]).toHaveLength(2);
  });

  it("no events filter passes all events through", async () => {
    const out = await runNode(TYPE, {}, [SUBSCRIBER_CREATED_PAYLOAD]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(SUBSCRIBER_CREATED_PAYLOAD);
  });
});
