import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.hubspotTrigger";

const COMPANY_CREATED_PAYLOAD = {
  eventId: "evt-001",
  subscriptionId: "sub-001",
  portalId: 12345,
  appId: 67890,
  occurredAt: 1700000000000,
  subscriptionType: "company.created",
  attemptNumber: 0,
  objectId: 98765,
  changeSource: "API",
  changeFlag: "NEW",
};

const CONTACT_PROPERTY_CHANGED_EMAIL = {
  eventId: "evt-002",
  subscriptionId: "sub-002",
  portalId: 12345,
  appId: 67890,
  occurredAt: 1700000001000,
  subscriptionType: "contact.propertyChange",
  attemptNumber: 0,
  objectId: 54321,
  propertyName: "email",
  propertyValue: "test@example.com",
  changeSource: "API",
};

const CONTACT_PROPERTY_CHANGED_OTHER = {
  eventId: "evt-003",
  subscriptionId: "sub-002",
  portalId: 12345,
  appId: 67890,
  occurredAt: 1700000002000,
  subscriptionType: "contact.propertyChange",
  attemptNumber: 0,
  objectId: 54321,
  propertyName: "lastname",
  propertyValue: "Smith",
  changeSource: "API",
};

const CONVERSATION_NEW_MESSAGE = {
  eventId: "evt-004",
  subscriptionId: "sub-003",
  portalId: 12345,
  appId: 67890,
  occurredAt: 1700000003000,
  subscriptionType: "conversation.newMessage",
  attemptNumber: 0,
  objectId: 11111,
};

const DEAL_DELETED = {
  eventId: "evt-005",
  subscriptionId: "sub-004",
  portalId: 12345,
  appId: 67890,
  occurredAt: 1700000004000,
  subscriptionType: "deal.deleted",
  attemptNumber: 0,
  objectId: 22222,
};

const TICKET_PROPERTY_CHANGED = {
  eventId: "evt-006",
  subscriptionId: "sub-005",
  portalId: 12345,
  appId: 67890,
  occurredAt: 1700000005000,
  subscriptionType: "ticket.propertyChange",
  attemptNumber: 0,
  objectId: 33333,
  propertyName: "hs_pipeline",
  propertyValue: "0",
};

describe("batch-queue hubspotTrigger — n8n-nodes-base.hubspotTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("HubSpot Trigger");
  });

  it("passes through a valid company-created webhook payload", async () => {
    const out = await runNode(TYPE, { eventSubscriptions: ["company"] }, [
      COMPANY_CREATED_PAYLOAD,
    ]);
    expect(out).toEqual([[{ json: COMPANY_CREATED_PAYLOAD }]]);
  });

  it("emits one item per HubSpot event in delivery order", async () => {
    const events = [CONVERSATION_NEW_MESSAGE, DEAL_DELETED, TICKET_PROPERTY_CHANGED];
    const out = await runNode(
      TYPE,
      { eventSubscriptions: ["conversation", "deal", "ticket"] },
      events,
    );
    expect(out).toEqual([[{ json: CONVERSATION_NEW_MESSAGE }, { json: DEAL_DELETED }, { json: TICKET_PROPERTY_CHANGED }]]);
  });

  it("preserves binary data when present", async () => {
    const out = await runNode(TYPE, {}, [
      { json: COMPANY_CREATED_PAYLOAD, binary: { file: { fileName: "test.json" } } },
    ]);
    expect(out[0][0].json).toEqual(COMPANY_CREATED_PAYLOAD);
    expect(out[0][0].binary?.file?.fileName).toBe("test.json");
  });

  it("emits a single empty item when no input (manual run)", async () => {
    const out = await runNode(TYPE, { eventSubscriptions: ["contact"] }, []);
    expect(out).toEqual([[{ json: {} }]]);
  });

  it("uses pin data instead of webhook payload when pinned", async () => {
    const pinned = [
      { json: { eventId: "pinned-001", subscriptionType: "company.created", pinned: true } },
    ];
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "HubSpot Trigger",
          type: TYPE,
          typeVersion: 1,
          parameters: { eventSubscriptions: ["company"] },
        }),
        makeNode({ id: "n1", name: "Pass", type: "n8n-nodes-base.noOp" }),
      ],
      {
        "HubSpot Trigger": {
          main: [[{ node: "Pass", type: "main", index: 0 }]],
        },
      },
    );
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: { "HubSpot Trigger": pinned },
    });
    expect(result.success).toBe(true);
    expect(result.runData["HubSpot Trigger"]?.items?.[0]).toEqual(pinned);
    expect(result.runData["Pass"]?.items?.[0][0].json).toEqual(pinned[0].json);
  });

  it("feeds NoOp downstream when webhook payload is injected", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "HubSpot Trigger",
          type: TYPE,
          typeVersion: 1,
          parameters: { eventSubscriptions: ["company"] },
        }),
        makeNode({
          id: "n1",
          name: "No Operation",
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
        }),
      ],
      {
        "HubSpot Trigger": {
          main: [[{ node: "No Operation", type: "main", index: 0 }]],
        },
      },
    );
    const result = await runWorkflowFixture(wf);
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
  });
});