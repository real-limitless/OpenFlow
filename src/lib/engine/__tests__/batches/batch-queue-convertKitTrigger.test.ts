import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.convertKitTrigger";

const FORM_SUBSCRIBE_PAYLOAD = {
  event: "form_subscribe",
  subscriber: { id: 1, email: "a@b.com", name: "Alice" },
  form: { id: 42, name: "Newsletter" },
};

const TAG_ADD_PAYLOAD = {
  event: "tag_add",
  subscriber: { id: 2, email: "b@c.com", name: "Bob" },
  tag: { id: 7, name: "VIP" },
};

const SEQUENCE_COMPLETE_PAYLOAD = {
  event: "sequence_complete",
  subscriber: { id: 3, email: "c@d.com", name: "Charlie" },
  sequence: { id: 5, name: "Onboarding" },
};

const SUBSCRIBER_UNSUBSCRIBE_PAYLOAD = {
  event: "subscriber_unsubscribe",
  subscriber: { id: 4, email: "d@e.com", name: "Diana" },
};

const PURCHASE_CREATED_PAYLOAD = {
  event: "purchase_created",
  subscriber: { id: 5, email: "e@f.com", name: "Eve" },
  purchase: { id: 99, amount: 2999, currency: "USD" },
};

describe("batch-queue convertKitTrigger — n8n-nodes-base.convertKitTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ConvertKit Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("form subscribe event received", async () => {
    const out = await runNode(
      TYPE,
      { event: "form_subscribe" },
      [FORM_SUBSCRIBE_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(FORM_SUBSCRIBE_PAYLOAD);
  });

  it("tag add event", async () => {
    const out = await runNode(
      TYPE,
      { event: "tag_add" },
      [TAG_ADD_PAYLOAD],
    );
    expect(out[0][0].json.event).toBe("tag_add");
    expect((out[0][0].json as Record<string, unknown>).tag).toMatchObject({ name: "VIP" });
  });

  it("sequence complete event", async () => {
    const out = await runNode(
      TYPE,
      { event: "sequence_complete" },
      [SEQUENCE_COMPLETE_PAYLOAD],
    );
    expect(out[0][0].json.event).toBe("sequence_complete");
    expect((out[0][0].json as Record<string, unknown>).sequence).toMatchObject({ id: 5 });
  });

  it("subscriber unsubscribe event", async () => {
    const out = await runNode(
      TYPE,
      { event: "subscriber_unsubscribe" },
      [SUBSCRIBER_UNSUBSCRIBE_PAYLOAD],
    );
    expect(out[0][0].json.event).toBe("subscriber_unsubscribe");
  });

  it("purchase created event", async () => {
    const out = await runNode(
      TYPE,
      { event: "purchase_created" },
      [PURCHASE_CREATED_PAYLOAD],
    );
    expect(out[0][0].json.event).toBe("purchase_created");
    expect((out[0][0].json as Record<string, unknown>).purchase).toMatchObject({ amount: 2999 });
  });

  it("specific event filter rejects non-matching events", async () => {
    const out = await runNode(
      TYPE,
      { event: "tag_remove" },
      [TAG_ADD_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("missing event field returns empty output", async () => {
    const out = await runNode(
      TYPE,
      { event: "form_subscribe" },
      [{ not_event: true }],
    );
    expect(out).toEqual([[]]);
  });
});
