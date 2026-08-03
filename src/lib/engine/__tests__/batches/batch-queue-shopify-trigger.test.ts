import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.shopifyTrigger";

const ORDER_CREATED_PAYLOAD = {
  id: 1234567890,
  email: "customer@example.com",
  total_price: "99.99",
  line_items: [{ title: "Product", quantity: 1, price: "99.99" }],
};

const PRODUCT_UPDATED_PAYLOAD = {
  id: 987654321,
  title: "Updated T-Shirt",
  status: "active",
  variants: [{ price: "29.99", inventory_quantity: 50 }],
};

describe("batch-queue shopifyTrigger — n8n-nodes-base.shopifyTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Shopify Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("order_created_webhook — passes through order payload on main output", async () => {
    const out = await runNode(
      TYPE,
      { topic: "orders/create", authentication: "apiKey" },
      [ORDER_CREATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(1234567890);
    expect(out[0][0].json.email).toBe("customer@example.com");
    expect(out[0][0].json.total_price).toBe("99.99");
    expect(out[0][0].json.line_items).toHaveLength(1);
  });

  it("product_updated_webhook — passes through product payload", async () => {
    const out = await runNode(
      TYPE,
      { topic: "products/update", authentication: "apiKey" },
      [PRODUCT_UPDATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(987654321);
    expect(out[0][0].json.title).toBe("Updated T-Shirt");
  });

  it("multiple items pass through", async () => {
    const out = await runNode(
      TYPE,
      { topic: "orders/create", authentication: "apiKey" },
      [ORDER_CREATED_PAYLOAD, PRODUCT_UPDATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe(1234567890);
    expect(out[0][1].json.id).toBe(987654321);
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(TYPE, { topic: "orders/create", authentication: "apiKey" }, []);
    expect(out).toEqual([[]]);
  });
});
