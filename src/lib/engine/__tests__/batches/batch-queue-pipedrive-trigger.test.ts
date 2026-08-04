import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx, makeNode } from "../helpers";
import type { INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pipedriveTrigger";

const DEAL_ADDED_PAYLOAD = {
  event: "added.deal",
  id: 12345,
  object_type: "deal",
  company_id: 67890,
  current: {
    id: 99,
    title: "Test Deal",
    value: 1000,
    currency: "USD",
    status: "open",
  },
  previous: null,
  meta: {
    id: 99,
    action: "added",
    object: "deal",
    timestamp: "2026-08-02T12:00:00Z",
    company_id: 7,
    user_id: 42,
  },
  timestamp: "2025-06-01T12:00:00Z",
};

const PERSON_UPDATED_PAYLOAD = {
  event: "updated.person",
  id: 54321,
  object_type: "person",
  company_id: 67890,
  current: {
    id: 54321,
    name: "John Doe",
    email: "john@example.com",
    phone: "+1234567890",
  },
  previous: {
    name: "John Doe",
    email: "john.old@example.com",
  },
  meta: {
    id: 54321,
    action: "updated",
    object: "person",
    timestamp: "2026-08-02T13:00:00Z",
    company_id: 7,
    user_id: 42,
  },
  timestamp: "2025-06-01T13:00:00Z",
};

const ORG_UPDATED_PAYLOAD = {
  event: "updated.organization",
  id: 55,
  meta: {
    id: 55,
    action: "updated",
    object: "organization",
    timestamp: "2026-08-02T14:00:00Z",
    company_id: 7,
    user_id: 42,
  },
};

const API_RESOURCE = {
  success: true,
  data: { id: 99, title: "Test deal", value: 500, currency: "USD", owner_id: 42, stage_id: 1, status: "open" },
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

describe("batch-queue pipedriveTrigger — n8n-nodes-base.pipedriveTrigger", () => {
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
    expect(getNodeType(TYPE).displayName).toBe("Pipedrive Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("deal added — passes through webhook payload", async () => {
    const out = await runNode(
      TYPE,
      { eventObject: "Deal", eventAction: "added", resolveData: false },
      [DEAL_ADDED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("added.deal");
    expect(out[0][0].json.id).toBe(12345);
    expect(out[0][0].json.current.title).toBe("Test Deal");
    expect(out[0][0].json.current.value).toBe(1000);
    expect(out[0][0].json.company_id).toBe(67890);
  });

  it("person updated — passes through webhook payload with previous state", async () => {
    const out = await runNode(
      TYPE,
      { eventObject: "Person", eventAction: "updated", resolveData: false },
      [PERSON_UPDATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("updated.person");
    expect(out[0][0].json.id).toBe(54321);
    expect(out[0][0].json.current.name).toBe("John Doe");
    expect(out[0][0].json.previous.email).toBe("john.old@example.com");
  });

  it("multiple deliveries — each produces one item", async () => {
    const out = await runNode(
      TYPE,
      { eventObject: "*", eventAction: "*", resolveData: false },
      [DEAL_ADDED_PAYLOAD, PERSON_UPDATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.event).toBe("added.deal");
    expect(out[0][1].json.event).toBe("updated.person");
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(
      TYPE,
      { eventObject: "Deal", eventAction: "added", resolveData: false },
      [],
    );
    expect(out).toEqual([[]]);
  });

  it("resolveData fetches full API resource", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(API_RESOURCE), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const out = await runNode(
      TYPE,
      { eventObject: "Deal", eventAction: "added", resolveData: true },
      [DEAL_ADDED_PAYLOAD],
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.pipedrive.com/v1/deals/99",
      expect.objectContaining({ method: "GET" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(API_RESOURCE.data);
    expect(out[0][0].json.title).toBe("Test deal");
  });

  it("resolveData uses correct resource path for organization", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 55, name: "Acme Corp" } }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const out = await runNode(
      TYPE,
      { eventObject: "organization", eventAction: "updated", resolveData: true },
      [ORG_UPDATED_PAYLOAD],
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.pipedrive.com/v1/organizations/55",
      expect.objectContaining({ method: "GET" }),
    );
    expect(out[0][0].json.name).toBe("Acme Corp");
  });

  it("resolveData falls through to envelope on API error", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 429 }));

    const out = await runNode(
      TYPE,
      { eventObject: "Deal", eventAction: "added", resolveData: true },
      [DEAL_ADDED_PAYLOAD],
    );

    // Falls through to raw envelope
    expect(out[0][0].json.event).toBe("added.deal");
    expect(out[0][0].json.current.title).toBe("Test Deal");
    expect(out[0][0].json.meta.object).toBe("deal");
  });

  it("resolveData falls through to envelope when meta is missing", async () => {
    const payload = { event: "added.deal", current: { id: 99, title: "orphan" } };

    const out = await runNode(
      TYPE,
      { eventObject: "Deal", eventAction: "added", resolveData: true },
      [payload],
    );

    expect(out[0][0].json.event).toBe("added.deal");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
