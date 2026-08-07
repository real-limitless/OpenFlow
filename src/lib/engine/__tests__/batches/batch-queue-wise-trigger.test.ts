import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.wiseTrigger";

const BALANCE_CREDIT_PAYLOAD = {
  data: {
    type: "balance-credit",
    id: "event-001",
    attributes: {
      currency: "EUR",
      amount: 500.0,
      reference: "Payment from client",
      occurred_at: "2026-08-07T12:00:00Z",
    },
  },
};

const TRANSFER_STATUS_UPDATE_PAYLOAD = {
  data: {
    type: "transfers#status-update",
    id: "evt-transfer-1",
    attributes: {
      transfer_id: 1234567,
      status: "outgoing_payment_sent",
      source_currency: "USD",
      target_currency: "EUR",
      source_value: 1000.0,
      target_value: 920.5,
      occurred_at: "2026-08-07T12:05:00Z",
    },
  },
};

const TRANSFER_CASE_UPDATE_PAYLOAD = {
  data: {
    type: "transfers#active-cases-update",
    id: "evt-case-1",
    attributes: {
      transfer_id: 1234567,
      active_cases: ["case-abc", "case-def"],
    },
  },
};

describe("batch-queue wiseTrigger — n8n-nodes-base.wiseTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Wise Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("filters to balance-credit events only", async () => {
    const out = await runNode(
      TYPE,
      { event: "balance-credit" },
      [BALANCE_CREDIT_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(BALANCE_CREDIT_PAYLOAD);
  });

  it("filters to transfer status update events only", async () => {
    const out = await runNode(
      TYPE,
      { event: "transfers#status-update" },
      [TRANSFER_STATUS_UPDATE_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(TRANSFER_STATUS_UPDATE_PAYLOAD);
  });

  it("filters to transfer active case update events only", async () => {
    const out = await runNode(
      TYPE,
      { event: "transfers#active-cases-update" },
      [TRANSFER_CASE_UPDATE_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>)?.data).toEqual(TRANSFER_CASE_UPDATE_PAYLOAD.data);
  });

  it("rejects non-matching event types", async () => {
    const out = await runNode(
      TYPE,
      { event: "balance-credit" },
      [TRANSFER_STATUS_UPDATE_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("empty input produces empty output", async () => {
    const out = await runNode(TYPE, { event: "balance-credit" }, [{}]);
    expect(out).toEqual([[]]);
  });
});
