import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.wooCommerceTrigger";

const ORDER_CREATED_PAYLOAD = {
  id: 12345,
  status: "processing",
  total: "99.99",
  line_items: [{ name: "Widget", quantity: 1, total: "99.99" }],
  billing: { first_name: "Jane", email: "jane@example.com" },
};

const PRODUCT_UPDATED_PAYLOAD = {
  id: 67890,
  name: "Super Widget",
  price: "29.99",
  stock_quantity: 100,
};

describe("batch-queue wooCommerceTrigger — n8n-nodes-base.wooCommerceTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("WooCommerce Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("order.created webhook payload passes through as-is", async () => {
    const out = await runNode(TYPE, { event: "order.created" }, [ORDER_CREATED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(12345);
    expect(out[0][0].json.status).toBe("processing");
    expect(out[0][0].json.total).toBe("99.99");
    expect(out[0][0].json.line_items).toHaveLength(1);
    expect(out[0][0].json.billing.email).toBe("jane@example.com");
  });

  it("product.updated webhook payload passes through as-is", async () => {
    const out = await runNode(TYPE, { event: "product.updated" }, [PRODUCT_UPDATED_PAYLOAD]);
    expect(out).toEqual([[{ json: PRODUCT_UPDATED_PAYLOAD }]]);
  });

  it("multiple webhook payloads pass through", async () => {
    const out = await runNode(TYPE, { event: "order.created" }, [ORDER_CREATED_PAYLOAD, PRODUCT_UPDATED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe(12345);
    expect(out[0][1].json.id).toBe(67890);
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(TYPE, { event: "order.created" }, []);
    expect(out).toEqual([[]]);
  });

  it("defaults to order.created event", async () => {
    const out = await runNode(TYPE, {}, [ORDER_CREATED_PAYLOAD]);
    expect(out[0][0].json.id).toBe(12345);
  });

  it("resolves to the same executor via type and alias stripping", () => {
    const exec = getExecutor(TYPE);
    expect(exec).toBeDefined();
    expect(getExecutor("nodes-base.wooCommerceTrigger")).toBe(exec);
  });
});
