import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.chargebeeTrigger";

const SUBSCRIPTION_CREATED_PAYLOAD = {
  id: "ev_test_sub_created",
  occurred_at: 1712000000,
  source: "api",
  event_type: "subscription_created",
  api_version: "v2",
  content: {
    subscription: {
      id: "sub_test_123",
      status: "active",
      plan_id: "basic-monthly",
    },
    customer: {
      id: "crm_test_456",
      email: "test@example.com",
    },
  },
};

const PAYMENT_SUCCEEDED_PAYLOAD = {
  id: "ev_test_payment",
  occurred_at: 1712000001,
  source: "api",
  event_type: "payment_succeeded",
  api_version: "v2",
  content: {
    transaction: {
      id: "txn_test_789",
      amount: 2999,
      currency: "USD",
      status: "success",
    },
  },
};

const INVOICE_GENERATED_PAYLOAD = {
  id: "ev_test_invoice",
  occurred_at: 1712000002,
  source: "api",
  event_type: "invoice_generated",
  api_version: "v2",
  content: {
    invoice: {
      id: "inv_test_001",
      amount_due: 5000,
      currency: "USD",
      status: "generated",
    },
  },
};

describe("batch-queue chargebeeTrigger — n8n-nodes-base.chargebeeTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Chargebee Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("receive a subscription_created event", async () => {
    const out = await runNode(
      TYPE,
      { events: ["subscription_created"] },
      [SUBSCRIPTION_CREATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(SUBSCRIPTION_CREATED_PAYLOAD);
  });

  it("wildcard events filter passes all event types", async () => {
    const out = await runNode(
      TYPE,
      { events: ["*"] },
      [PAYMENT_SUCCEEDED_PAYLOAD, INVOICE_GENERATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.event_type).toBe("payment_succeeded");
    expect(out[0][1].json.event_type).toBe("invoice_generated");
  });

  it("specific event filter rejects non-matching events", async () => {
    const out = await runNode(
      TYPE,
      { events: ["subscription_cancelled"] },
      [PAYMENT_SUCCEEDED_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("erroneous JSON payload returns empty output", async () => {
    const out = await runNode(
      TYPE,
      { events: ["*"] },
      [{ not_event: true }],
    );
    expect(out).toEqual([[]]);
  });
});
