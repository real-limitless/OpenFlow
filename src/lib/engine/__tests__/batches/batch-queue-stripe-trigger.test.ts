import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.stripeTrigger";

const CHARGE_SUCCEEDED_PAYLOAD = {
  id: "evt_3OXYZ123",
  object: "event",
  api_version: "2020-08-27",
  created: 1700000000,
  type: "charge.succeeded",
  data: {
    object: {
      id: "ch_3ABCD",
      amount: 2000,
      currency: "usd",
      status: "succeeded",
    },
    previous_attributes: null,
  },
  livemode: false,
  pending_webhooks: 0,
  request: {
    id: "req_XYZ",
    idempotency_key: null,
  },
};

const INVOICE_PAID_PAYLOAD = {
  id: "evt_4XYZ456",
  object: "event",
  api_version: "2020-08-27",
  created: 1700000001,
  type: "invoice.payment_succeeded",
  data: {
    object: {
      id: "in_1DEF",
      amount_due: 5000,
      currency: "usd",
      status: "paid",
    },
    previous_attributes: null,
  },
  livemode: false,
  pending_webhooks: 0,
  request: {
    id: "req_ABC",
    idempotency_key: null,
  },
};

const CHARGE_FAILED_PAYLOAD = {
  id: "evt_5XYZ789",
  object: "event",
  api_version: "2020-08-27",
  created: 1700000002,
  type: "charge.failed",
  data: {
    object: {
      id: "ch_5EFG",
      amount: 1500,
      currency: "usd",
      status: "failed",
    },
    previous_attributes: null,
  },
  livemode: false,
  pending_webhooks: 0,
  request: {
    id: "req_DEF",
    idempotency_key: null,
  },
};

describe("batch-queue stripeTrigger — n8n-nodes-base.stripeTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Stripe Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("charge.succeeded event passes through with id/created/livemode/type", async () => {
    const out = await runNode(
      TYPE,
      { events: ["charge.succeeded"], resolveData: true },
      [CHARGE_SUCCEEDED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("evt_3OXYZ123");
    expect(out[0][0].json.created).toBe(1700000000);
    expect(out[0][0].json.livemode).toBe(false);
    expect(out[0][0].json.type).toBe("charge.succeeded");
  });

  it("filters out event types not in the selected list", async () => {
    const out = await runNode(
      TYPE,
      { events: ["invoice.payment_succeeded"], resolveData: true },
      [CHARGE_SUCCEEDED_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("deduplicates by event id", async () => {
    const out = await runNode(
      TYPE,
      { events: ["charge.succeeded"], resolveData: true },
      [CHARGE_SUCCEEDED_PAYLOAD, CHARGE_SUCCEEDED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("evt_3OXYZ123");
  });

  it("wildcard * matches all event types", async () => {
    const out = await runNode(
      TYPE,
      { events: ["*"], resolveData: true },
      [CHARGE_SUCCEEDED_PAYLOAD, INVOICE_PAID_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
  });

  it("invoice payment event passes through", async () => {
    const out = await runNode(
      TYPE,
      { events: ["invoice.payment_succeeded"], resolveData: true },
      [INVOICE_PAID_PAYLOAD],
    );
    expect(out).toEqual([[{ json: INVOICE_PAID_PAYLOAD }]]);
  });

  it("multiple items pass through when all match", async () => {
    const out = await runNode(
      TYPE,
      { events: ["charge.succeeded", "invoice.payment_succeeded"], resolveData: true },
      [CHARGE_SUCCEEDED_PAYLOAD, INVOICE_PAID_PAYLOAD],
    );
    expect(out).toEqual([
      [{ json: CHARGE_SUCCEEDED_PAYLOAD }, { json: INVOICE_PAID_PAYLOAD }],
    ]);
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(TYPE, { events: ["charge.succeeded"], resolveData: true }, []);
    expect(out).toEqual([[]]);
  });

  it("body passes through as-is (resolveData preserved)", async () => {
    const out = await runNode(
      TYPE,
      { events: ["charge.succeeded"], resolveData: false },
      [CHARGE_SUCCEEDED_PAYLOAD],
    );
    expect(out[0][0].json.data.object.id).toBe("ch_3ABCD");
  });
});
