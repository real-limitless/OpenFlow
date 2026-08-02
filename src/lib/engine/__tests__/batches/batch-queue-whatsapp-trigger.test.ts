import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.whatsAppTrigger";

const MESSAGES_DELIVERY = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "102290129340398",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "16505551111", phone_number_id: "123456789" },
            contacts: [{ profile: { name: "Ada" }, wa_id: "15551234567" }],
            messages: [
              { from: "15551234567", id: "wamid.ABC123", timestamp: "1700000000", type: "text", text: { body: "hello" } },
            ],
          },
        },
      ],
    },
  ],
};

const TWO_MESSAGE_DELIVERY = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "102290129340398",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "16505551111", phone_number_id: "123456789" },
            contacts: [{ profile: { name: "Ada" }, wa_id: "15551234567" }],
            messages: [{ from: "15551234567", id: "wamid.ABC123", timestamp: "1700000000", type: "text", text: { body: "first" } }],
          },
        },
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "16505551111", phone_number_id: "123456789" },
            contacts: [{ profile: { name: "Bob" }, wa_id: "15557654321" }],
            messages: [{ from: "15557654321", id: "wamid.DEF456", timestamp: "1700000001", type: "text", text: { body: "second" } }],
          },
        },
      ],
    },
  ],
};

const SECURITY_DELIVERY = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "102290129340398",
      changes: [
        { field: "security", value: { event: "login", timestamp: "1700000000" } },
      ],
    },
  ],
};

describe("batch-queue whatsAppTrigger — n8n-nodes-base.whatsAppTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("WhatsApp Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("messages event emitted with pass-through body", async () => {
    const out = await runNode(TYPE, { events: ["messages"] }, [MESSAGES_DELIVERY]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const item = out[0][0].json;
    expect(item.field).toBe("messages");
    expect(item.messages[0].text.body).toBe("hello");
    expect(item.messages[0].from).toBe("15551234567");
    expect(item.metadata.phone_number_id).toBe("123456789");
  });

  it("event filtering — security selected but delivery contains only messages", async () => {
    const out = await runNode(TYPE, { events: ["security"] }, [MESSAGES_DELIVERY]);
    expect(out).toEqual([[]]);
  });

  it("security event emitted when matching", async () => {
    const out = await runNode(TYPE, { events: ["security"] }, [SECURITY_DELIVERY]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.field).toBe("security");
    expect(out[0][0].json.event).toBe("login");
  });

  it("multiple events in one delivery yield multiple output items", async () => {
    const out = await runNode(TYPE, { events: ["messages"] }, [TWO_MESSAGE_DELIVERY]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.messages[0].text.body).toBe("first");
    expect(out[0][1].json.messages[0].text.body).toBe("second");
  });

  it("unknown object type is silently dropped", async () => {
    const out = await runNode(
      TYPE,
      { events: ["messages"] },
      [{ object: "unknown", entry: [{ changes: [{ field: "messages", value: {} }] }] }],
    );
    expect(out).toEqual([[]]);
  });

  it("empty input yields empty output", async () => {
    const out = await runNode(TYPE, { events: ["messages"] }, []);
    expect(out).toEqual([[]]);
  });
});
