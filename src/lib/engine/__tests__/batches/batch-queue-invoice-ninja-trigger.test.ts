import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.invoiceNinjaTrigger";

const CLIENT_CREATED_PAYLOAD = {
  event_type: "create_client",
  data: {
    id: 1,
    name: "Acme Corp",
    created_at: "2025-01-15T10:00:00Z",
  },
};

const INVOICE_CREATED_PAYLOAD = {
  event_type: "create_invoice",
  data: {
    id: 42,
    client_id: 1,
    amount: 100.00,
    status: "sent",
  },
};

const UNKNOWN_EVENT_PAYLOAD = {
  event_type: "create_unknown",
  data: { id: 99 },
};

describe("batch-queue invoiceNinjaTrigger — n8n-nodes-base.invoiceNinjaTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Invoice Ninja Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("create_client event passes through", async () => {
    const out = await runNode(TYPE, { event: "create_client" }, [CLIENT_CREATED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event_type).toBe("create_client");
    expect((out[0][0].json.data as Record<string, unknown>).name).toBe("Acme Corp");
  });

  it("create_invoice event passes through when event matches", async () => {
    const out = await runNode(TYPE, { event: "create_invoice" }, [INVOICE_CREATED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event_type).toBe("create_invoice");
  });

  it("filters out events not matching the configured event", async () => {
    const out = await runNode(
      TYPE,
      { event: "create_invoice" },
      [CLIENT_CREATED_PAYLOAD],
    );
    expect(out).toEqual([[]]);
  });

  it("unknown event type throws without continueOnFail", async () => {
    await expect(
      runNode(TYPE, { event: "create_client" }, [UNKNOWN_EVENT_PAYLOAD]),
    ).rejects.toThrow("Unknown event");
  });

  it("unknown event type produces error item with continueOnFail", async () => {
    const out = await runNode(
      TYPE,
      { event: "create_client", continueOnFail: true },
      [UNKNOWN_EVENT_PAYLOAD],
      { continueOnFail: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });

  it("empty input yields empty output", async () => {
    const out = await runNode(TYPE, { event: "create_client" }, []);
    expect(out).toEqual([[]]);
  });
});
