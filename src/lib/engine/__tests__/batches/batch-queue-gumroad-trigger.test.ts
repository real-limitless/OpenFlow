import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gumroadTrigger";

const SALE_PAYLOAD = {
  sale_id: "abc123",
  product_name: "Digital Book",
  product_permalink: "digital-book",
  email: "buyer@example.com",
  price: 999,
  currency: "usd",
  quantity: 1,
  referrer: "direct",
};

const REFUND_PAYLOAD = {
  sale_id: "abc124",
  product_name: "Digital Book",
  email: "buyer@example.com",
  price: 999,
  currency: "usd",
  refunded: true,
};

describe("batch-queue gumroadTrigger — n8n-nodes-base.gumroadTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Gumroad Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("sale webhook passes through payload verbatim", async () => {
    const out = await runNode(TYPE, { resource: "sale" }, [SALE_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(SALE_PAYLOAD);
  });

  it("refund webhook passes through payload verbatim", async () => {
    const out = await runNode(TYPE, { resource: "refund" }, [REFUND_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(REFUND_PAYLOAD);
  });

  it("empty input emits a single empty item", async () => {
    const out = await runNode(TYPE, { resource: "sale" }, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual([{ json: {} }]);
  });
});
