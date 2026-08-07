import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.payPalTrigger";

const CAPTURE_COMPLETED_PAYLOAD = {
  id: "WH-12345ABC",
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

const CAPTURE_DENIED_PAYLOAD = {
  id: "WH-67890DEF",
  event_version: "1.0",
  create_time: "2024-01-01T13:00:00Z",
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

const SUBSCRIPTION_CANCELLED_PAYLOAD = {
  id: "WH-11111GHI",
  event_version: "1.0",
  create_time: "2024-01-02T10:00:00Z",
  resource_type: "subscription",
  event_type: "BILLING.SUBSCRIPTION.CANCELLED",
  summary: "Subscription cancelled",
  resource: { id: "I-SUB123", status: "CANCELLED" },
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

  it("passes a matching event through", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: ["PAYMENT.CAPTURE.COMPLETED"] },
      [CAPTURE_COMPLETED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event_type).toBe("PAYMENT.CAPTURE.COMPLETED");
    expect(out[0][0].json.resource).toEqual(CAPTURE_COMPLETED_PAYLOAD.resource);
    expect(out[0][0].json.id).toBe("WH-12345ABC");
  });

  it("filters out events not in the selected list", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: ["PAYMENT.CAPTURE.COMPLETED"] },
      [CAPTURE_DENIED_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("empty eventNames accepts all events (wildcard)", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: [] },
      [CAPTURE_COMPLETED_PAYLOAD, SUBSCRIPTION_CANCELLED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
  });

  it("drops malformed items without event_type", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: [] },
      [{ notAnEvent: true }],
    );
    expect(out).toEqual([[]]);
  });

  it("multiple items pass through when all match", async () => {
    const out = await runNode(
      TYPE,
      { eventNames: ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED"] },
      [CAPTURE_COMPLETED_PAYLOAD, CAPTURE_DENIED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.event_type).toBe("PAYMENT.CAPTURE.COMPLETED");
    expect(out[0][1].json.event_type).toBe("PAYMENT.CAPTURE.DENIED");
  });

  it("empty input yields empty output", async () => {
    const out = await runNode(TYPE, { eventNames: ["PAYMENT.CAPTURE.COMPLETED"] }, []);
    expect(out).toEqual([[]]);
  });
});
