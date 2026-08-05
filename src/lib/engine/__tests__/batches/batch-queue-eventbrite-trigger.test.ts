import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.eventbriteTrigger";

const ORDER_PLACED_PAYLOAD: Record<string, unknown> = {
  api_url: "https://www.eventbriteapi.com/v3/orders/12345/",
  webhook_id: "wh_abc123",
  config_type: "organization",
  config_id: "123456789",
  action: "order.placed",
  user_id: "u98765",
};

const EVENT_CREATED_PAYLOAD: Record<string, unknown> = {
  api_url: "https://www.eventbriteapi.com/v3/events/54321/",
  webhook_id: "wh_def456",
  config_type: "organization",
  config_id: "123456789",
  action: "event.created",
};

const RESOLVED_ORDER: Record<string, unknown> = {
  id: "12345",
  name: "Test Order",
  resource_uri: "https://www.eventbriteapi.com/v3/orders/12345/",
  email: "buyer@example.com",
  costs: { base_price: { display: "$25.00", value: 2500 } },
  attendees: [],
};

const RESOLVED_EVENT: Record<string, unknown> = {
  id: "54321",
  name: "Test Event",
  description: { text: "A test event" },
  url: "https://www.eventbrite.com/e/54321",
  start: { timezone: "America/New_York", local: "2026-09-01T10:00:00" },
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

describe("batch-queue eventbriteTrigger — n8n-nodes-base.eventbriteTrigger", () => {
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unmocked"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Eventbrite Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("resolveData=true fetches full resource from api_url", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(RESOLVED_ORDER), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const out = await runNode(
      TYPE,
      { organization: "123456789", actions: ["order.placed"], resolveData: true },
      [ORDER_PLACED_PAYLOAD],
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://www.eventbriteapi.com/v3/orders/12345/",
      expect.objectContaining({ method: "GET" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(RESOLVED_ORDER);
    expect(out[0][0].json.name).toBe("Test Order");
  });

  it("resolveData=false emits raw webhook payload without API call", async () => {
    const out = await runNode(
      TYPE,
      { organization: "123456789", actions: ["order.placed"], resolveData: false },
      [ORDER_PLACED_PAYLOAD],
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.api_url).toBe("https://www.eventbriteapi.com/v3/orders/12345/");
    expect(out[0][0].json.action).toBe("order.placed");
    expect(out[0][0].json.webhook_id).toBe("wh_abc123");
  });

  it("multiple webhook payloads produce multiple output items", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes("orders/12345")) {
        return Promise.resolve(new Response(JSON.stringify(RESOLVED_ORDER), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify(RESOLVED_EVENT), { status: 200, headers: { "Content-Type": "application/json" } }));
    });

    const out = await runNode(
      TYPE,
      { organization: "123456789", actions: ["event.created", "event.published", "event.updated"], resolveData: true },
      [EVENT_CREATED_PAYLOAD, ORDER_PLACED_PAYLOAD],
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("54321");
    expect(out[0][1].json.id).toBe("12345");
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(
      TYPE,
      { organization: "123456789", actions: ["order.placed"], resolveData: true },
      [],
    );
    expect(out).toEqual([[]]);
  });

  it("falls through to raw payload when API fetch fails", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 429 }));

    const out = await runNode(
      TYPE,
      { organization: "123456789", actions: ["order.placed"], resolveData: true },
      [ORDER_PLACED_PAYLOAD],
    );

    expect(out[0][0].json.api_url).toBe("https://www.eventbriteapi.com/v3/orders/12345/");
    expect(out[0][0].json.action).toBe("order.placed");
  });

  it("falls through to raw payload when api_url is empty (edge)", async () => {
    const payload = { action: "event.updated", webhook_id: "wh_xyz" };

    const out = await runNode(
      TYPE,
      { resolveData: true },
      [payload],
    );

    expect(out[0][0].json.action).toBe("event.updated");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
