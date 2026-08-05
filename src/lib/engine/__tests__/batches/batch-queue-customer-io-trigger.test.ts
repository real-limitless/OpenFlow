import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.customerIoTrigger";

const SUBSCRIBED_PAYLOAD = {
  event_id: "evt_cus_sub_001",
  event_type: "customer.subscribed",
  timestamp: "2025-01-15T10:30:00Z",
  data: {
    customer_id: "cus_123",
    email: "user@example.com",
  },
};

const EMAIL_BOUNCED_PAYLOAD = {
  event_id: "evt_email_bnc_002",
  event_type: "email.bounced",
  timestamp: "2025-01-15T11:00:00Z",
  data: {
    customer_id: "cus_456",
    email: "bounce@example.com",
    reason: "hard_bounce",
    detail: "550 5.1.1 mailbox does not exist",
    message_id: "msg_789",
  },
};

const PUSH_CLICKED_PAYLOAD = {
  event_id: "evt_push_clk_003",
  event_type: "push.clicked",
  timestamp: "2025-01-15T12:00:00Z",
  data: {
    customer_id: "cus_789",
    device_id: "device_xyz",
    link_url: "https://example.com/offer",
  },
};

describe("batch-queue customerIoTrigger — n8n-nodes-base.customerIoTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Customer.io Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("customer.subscribed event passes through with full payload", async () => {
    const out = await runNode(
      TYPE,
      { events: ["customer.subscribed"] },
      [SUBSCRIBED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event_id).toBe("evt_cus_sub_001");
    expect(out[0][0].json.event_type).toBe("customer.subscribed");
    expect(out[0][0].json.data.customer_id).toBe("cus_123");
  });

  it("email.bounced event passes through with bounce metadata", async () => {
    const out = await runNode(
      TYPE,
      { events: ["email.bounced"] },
      [EMAIL_BOUNCED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event_type).toBe("email.bounced");
    expect(out[0][0].json.data.email).toBe("bounce@example.com");
    expect(out[0][0].json.data.reason).toBe("hard_bounce");
    expect(out[0][0].json.data.message_id).toBe("msg_789");
  });

  it("push.clicked event passes through with push metadata", async () => {
    const out = await runNode(
      TYPE,
      { events: ["push.clicked"] },
      [PUSH_CLICKED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event_type).toBe("push.clicked");
    expect(out[0][0].json.data.device_id).toBe("device_xyz");
    expect(out[0][0].json.data.link_url).toBe("https://example.com/offer");
  });

  it("passes through all payload fields as-is (raw passthrough)", async () => {
    const payload = {
      event_id: "evt_raw_999",
      event_type: "customer.unsubscribed",
      timestamp: "2025-02-01T00:00:00Z",
      data: { customer_id: "cus_999", email: "gone@example.com" },
      extra_field: "should be preserved",
    };
    const out = await runNode(TYPE, { events: ["customer.unsubscribed"] }, [payload]);
    expect(out[0][0].json).toEqual(payload);
  });

  it("empty input yields one empty item (trigger default)", async () => {
    const out = await runNode(TYPE, { events: ["customer.subscribed"] }, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });
});
