import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.acuitySchedulingTrigger";

const APPOINTMENT_SCHEDULED_PAYLOAD = {
  action: "scheduled",
  id: "42",
  calendarID: "7",
  appointmentTypeID: "13",
};

const ORDER_COMPLETED_PAYLOAD = {
  action: "order.completed",
  id: "99",
};

const APPOINTMENT_CHANGED_PAYLOAD = {
  action: "changed",
  id: "100",
  calendarID: "3",
  appointmentTypeID: "8",
};

describe("batch-queue acuitySchedulingTrigger — n8n-nodes-base.acuitySchedulingTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Acuity Scheduling Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("appointment.scheduled — emits raw webhook payload when resolveData is false", async () => {
    const out = await runNode(
      TYPE,
      { event: ["appointment.scheduled"], resolveData: false },
      [APPOINTMENT_SCHEDULED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.action).toBe("scheduled");
    expect(out[0][0].json.id).toBe("42");
    expect(out[0][0].json.calendarID).toBe("7");
    expect(out[0][0].json.appointmentTypeID).toBe("13");
  });

  it("order.completed — emits raw webhook payload when resolveData is false", async () => {
    const out = await runNode(
      TYPE,
      { event: ["order.completed"], resolveData: false },
      [ORDER_COMPLETED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.action).toBe("order.completed");
    expect(out[0][0].json.id).toBe("99");
  });

  it("resolveData: true and no credential — falls back to raw payload", async () => {
    const out = await runNode(
      TYPE,
      { event: ["appointment.changed"], resolveData: true },
      [APPOINTMENT_CHANGED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.action).toBe("changed");
    expect(out[0][0].json.id).toBe("100");
  });

  it("multiple items pass through in order", async () => {
    const out = await runNode(
      TYPE,
      { event: ["appointment.scheduled", "appointment.canceled"], resolveData: false },
      [APPOINTMENT_SCHEDULED_PAYLOAD, { action: "canceled", id: "55", calendarID: "2", appointmentTypeID: "9" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.action).toBe("scheduled");
    expect(out[0][0].json.id).toBe("42");
    expect(out[0][1].json.action).toBe("canceled");
    expect(out[0][1].json.id).toBe("55");
  });

  it("empty input yields empty output", async () => {
    const out = await runNode(
      TYPE,
      { event: ["appointment.scheduled"], resolveData: false },
      [],
    );
    expect(out).toEqual([[]]);
  });
});
