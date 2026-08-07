import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.payPalTrigger";

const PAYMENT_CAPTURE_COMPLETED_PAYLOAD = {
  id: "WH-XXXX12345",
  event_version: "1.0",
  create_time: "2024-01-01T12:00:00Z",
  resource_type: "capture",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  summary: "Payment completed for $10.00 USD",
  resource: {
    id: "CAPTURE_ID",
    status: "COMPLETED",
    amount: { value: "10.00", currency_code: "USD" },
  },
  links: [],
};

const PAYMENT_CAPTURE_DENIED_PAYLOAD = {
  id: "WH-XXXX67890",
  event_version: "1.0",
  create_time: "2024-01-02T12:00:00Z",
  resource_type: "capture",
  event_type: "PAYMENT.CAPTURE.DENIED",
  summary: "Payment denied for $20.00 USD",
  resource: {
    id: "CAPTURE_ID_2",
    status: "DENIED",
    amount: { value: "20.00", currency_code: "USD" },
  },
  links: [],
};

const BILLING_SUBSCRIPTION_CANCELLED_PAYLOAD = {
  id: "WH-XXXX99999",
  event_version: "1.0",
  create_time: "2024-01-03T12:00:00Z",
  resource_type: "subscription",
  event_type: "BILLING.SUBSCRIPTION.CANCELLED",
  summary: "Subscription cancelled",
  resource: {
    id: "SUB_ID",
    status: "CANCELLED",
  },
  links: [],
};

describe("batch-queue payPalTrigger — n8n-nodes-base.payPalTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("PayPal Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("PAYMENT.CAPTURE.COMPLETED event passes through when selected", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: ["PAYMENT.CAPTURE.COMPLETED"] },
      [PAYMENT_CAPTURE_COMPLETED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("WH-XXXX12345");
    expect(out[0][0].json.event_type).toBe("PAYMENT.CAPTURE.COMPLETED");
    expect(out[0][0].json.resource).toBeTruthy();
  });

  it("filters out event types not in the selected list", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: ["PAYMENT.CAPTURE.DENIED"] },
      [PAYMENT_CAPTURE_COMPLETED_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("empty eventNames subscribes to all events (no filter)", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: [] },
      [PAYMENT_CAPTURE_COMPLETED_PAYLOAD, BILLING_SUBSCRIPTION_CANCELLED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
  });

  it("multiple event types pass through when all match", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: ["PAYMENT.CAPTURE.COMPLETED", "BILLING.SUBSCRIPTION.CANCELLED"] },
      [PAYMENT_CAPTURE_COMPLETED_PAYLOAD, BILLING_SUBSCRIPTION_CANCELLED_PAYLOAD],
    );
    expect(out).toEqual([
      [
        { json: PAYMENT_CAPTURE_COMPLETED_PAYLOAD },
        { json: BILLING_SUBSCRIPTION_CANCELLED_PAYLOAD },
      ],
    ]);
  });

  it("malformed payload (missing event_type) is silently dropped", async () => {
    const malformed = { id: "WH-BAD", resource_type: "capture" };
    const out = await runNode(TYPE, { eventNames: [] }, [malformed]);
    expect(out).toEqual([[]]);
  });

  it("non-JSON-like payload is silently dropped", async () => {
    const out = await runNode(TYPE, { eventNames: [] }, [{}]);
    expect(out).toEqual([[]]);
  });

  it("empty input yields empty output", async () => {
    const out = await runNode(TYPE, { eventNames: ["PAYMENT.CAPTURE.COMPLETED"] }, []);
    expect(out).toEqual([[]]);
  });
});
