import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.calendlyTrigger";

const INVITEE_CREATED_PAYLOAD = {
  event: "invitee.created",
  payload: {
    invitee: {
      uuid: "AAAAAAAABBBBCCCC",
      email: "someone@example.com",
      name: "Someone Somewhere",
      created_at: "2025-05-01T10:30:00Z",
      updated_at: "2025-05-01T10:30:00Z",
      cancel_url: "https://calendly.com/cancellations/AAAAAAAABBBBCCCC",
      reschedule_url: "https://calendly.com/reschedulings/AAAAAAAABBBBCCCC",
      questions_and_answers: [],
      cancel_reason: null,
      timezone: "America/Denver",
    },
    event_type: {
      uuid: "DDDDDDDDEEEEFFFF",
      name: "15 Minute Meeting",
      duration: 15,
      slug: "15mm",
      active: true,
      scheduling_url: "https://calendly.com/someone/15mm",
    },
    scheduled_event: {
      uuid: "GGGGGGGGHHHHIIII",
      start_time: "2025-05-02T14:00:00Z",
      end_time: "2025-05-02T14:15:00Z",
      name: "15 Minute Meeting",
      location: { type: "physical", location: null },
      status: "active",
    },
    created_at: "2025-05-01T10:30:00Z",
    updated_at: "2025-05-01T10:30:00Z",
  },
};

const INVITEE_CANCELED_PAYLOAD = {
  event: "invitee.canceled",
  payload: {
    invitee: {
      uuid: "JJJJJJJJKKKKLLLL",
      email: "canceled@example.com",
      name: "Canceled Person",
      created_at: "2025-05-01T11:00:00Z",
      updated_at: "2025-05-01T11:05:00Z",
      cancel_url: "https://calendly.com/cancellations/JJJJJJJJKKKKLLLL",
      reschedule_url: "https://calendly.com/reschedulings/JJJJJJJJKKKKLLLL",
      questions_and_answers: [],
      cancel_reason: "Schedule conflict",
      timezone: "America/Denver",
    },
    event_type: {
      uuid: "DDDDDDDDEEEEFFFF",
      name: "15 Minute Meeting",
      duration: 15,
      slug: "15mm",
      active: true,
      scheduling_url: "https://calendly.com/someone/15mm",
    },
    scheduled_event: {
      uuid: "GGGGGGGGHHHHIIII",
      start_time: "2025-05-02T14:00:00Z",
      end_time: "2025-05-02T14:15:00Z",
      name: "15 Minute Meeting",
      location: { type: "physical", location: null },
      status: "canceled",
    },
    created_at: "2025-05-01T11:00:00Z",
    updated_at: "2025-05-01T11:05:00Z",
  },
};

describe("batch-queue calendlyTrigger — n8n-nodes-base.calendlyTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Calendly Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("invitee.created — passes through payload on main output", async () => {
    const out = await runNode(
      TYPE,
      { authentication: "oAuth2", scope: "user", events: ["invitee.created"] },
      [INVITEE_CREATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("invitee.created");
    expect(out[0][0].json.payload.invitee.email).toBe("someone@example.com");
    expect(out[0][0].json.payload.event_type.name).toBe("15 Minute Meeting");
  });

  it("invitee.canceled — passes through canceled payload", async () => {
    const out = await runNode(
      TYPE,
      { authentication: "oAuth2", scope: "user", events: ["invitee.canceled"] },
      [INVITEE_CANCELED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("invitee.canceled");
    expect(out[0][0].json.payload.invitee.cancel_reason).toBe("Schedule conflict");
  });

  it("multiple event types — each delivery produces one item", async () => {
    const out = await runNode(
      TYPE,
      { authentication: "oAuth2", scope: "user", events: ["invitee.created", "invitee.canceled"] },
      [INVITEE_CREATED_PAYLOAD, INVITEE_CANCELED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.event).toBe("invitee.created");
    expect(out[0][1].json.event).toBe("invitee.canceled");
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(
      TYPE,
      { authentication: "oAuth2", scope: "user", events: ["invitee.created"] },
      [],
    );
    expect(out).toEqual([[]]);
  });
});
