import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.lemlistTrigger";

const EMAILS_OPENED_PAYLOAD = {
  type: "emailsOpened",
  data: {
    campaignId: "camp_123",
    leadId: "lead_456",
    email: "user@example.com",
    type: "emailsOpened",
    subject: "Hello",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
};

const LINKEDIN_INVITE_ACCEPTED_PAYLOAD = {
  type: "linkedinInviteAccepted",
  data: {
    campaignId: "camp_123",
    leadId: "lead_456",
    email: "user@example.com",
  },
};

describe("batch-queue lemlistTrigger — n8n-nodes-base.lemlistTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Lemlist Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("all events — receives emailsOpened webhook and wraps correctly", async () => {
    const out = await runNode(TYPE, { events: ["*"] }, [EMAILS_OPENED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const item = out[0][0];
    expect(item.json).toMatchObject({
      type: "emailsOpened",
      data: {
        campaignId: "camp_123",
        email: "user@example.com",
      },
    });
  });

  it("filtered events — matching emailsBounced passes through", async () => {
    const out = await runNode(
      TYPE,
      { events: ["emailsBounced"] },
      [{ type: "emailsBounced", data: { campaignId: "camp_123", leadId: "lead_456" } }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ type: "emailsBounced" });
  });

  it("filtered events — non-matching event is silently ignored", async () => {
    const out = await runNode(
      TYPE,
      { events: ["emailsBounced"] },
      [LINKEDIN_INVITE_ACCEPTED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("all events — linkedinInviteAccepted passes through when events=[\"*\"]", async () => {
    const out = await runNode(TYPE, { events: ["*"] }, [LINKEDIN_INVITE_ACCEPTED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ type: "linkedinInviteAccepted" });
  });

  it("empty input emits a single empty item", async () => {
    const out = await runNode(TYPE, { events: ["*"] }, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("default events is ['*'] — all events accepted", async () => {
    const out = await runNode(TYPE, {}, [EMAILS_OPENED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ type: "emailsOpened" });
  });
});
