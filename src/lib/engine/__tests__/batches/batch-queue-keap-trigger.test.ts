import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.keapTrigger";

const CONTACT_ADD_PAYLOAD = {
  event_type: "contact.add",
  eventTime: "2026-08-06T12:00:00Z",
  objectType: "contact",
  objectId: 12345,
  content: {
    contact: {
      id: 12345,
      given_name: "John",
      family_name: "Doe",
      email: "john@example.com",
    },
  },
};

const INVOICE_ADD_PAYLOAD = {
  event_type: "invoice.add",
  eventTime: "2026-08-06T12:01:00Z",
  objectType: "invoice",
  objectId: 67890,
  content: {
    invoice: {
      id: 67890,
      total: 5000,
      currency: "USD",
    },
  },
};

describe("batch-queue keapTrigger — n8n-nodes-base.keapTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Keap Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("receive a contact.add event", async () => {
    const out = await runNode(
      TYPE,
      { eventId: "contact.add", rawData: false },
      [CONTACT_ADD_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(CONTACT_ADD_PAYLOAD.content);
  });

  it("filters non-matching event types", async () => {
    const out = await runNode(
      TYPE,
      { eventId: "invoice.add", rawData: false },
      [CONTACT_ADD_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("rawData mode preserves payload envelope", async () => {
    const out = await runNode(
      TYPE,
      { eventId: "contact.add", rawData: true },
      [CONTACT_ADD_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(CONTACT_ADD_PAYLOAD);
  });

  it("multiple events in input are each processed", async () => {
    const out = await runNode(
      TYPE,
      { eventId: "contact.add", rawData: false },
      [CONTACT_ADD_PAYLOAD, INVOICE_ADD_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(CONTACT_ADD_PAYLOAD.content);
  });
});
