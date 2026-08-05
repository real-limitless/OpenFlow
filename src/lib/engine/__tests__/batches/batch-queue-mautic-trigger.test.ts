import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mauticTrigger";

const CONTACT_CREATED_PAYLOAD = {
  "mautic.lead_post_save_update": {
    contact: {
      id: 123,
      email: "test@example.com",
      firstname: "Test",
      lastname: "User",
    },
  },
};

const FORM_SUBMIT_PAYLOAD = {
  "mautic.form_on_submit": {
    contact: { id: 456, email: "lead@example.com" },
    field: { id: 1, value: "Form A" },
  },
};

describe("batch-queue mauticTrigger — n8n-nodes-base.mauticTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mautic Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("passes through a Mautic webhook payload as a single output item", async () => {
    const out = await runNode(TYPE, { events: ["mautic.lead_post_save_update"], authentication: "credentials" }, [CONTACT_CREATED_PAYLOAD]);
    expect(out).toEqual([[{ json: CONTACT_CREATED_PAYLOAD }]]);
  });

  it("passes through multiple webhook payloads as multiple output items", async () => {
    const out = await runNode(TYPE, { events: ["mautic.lead_post_save_update", "mautic.form_on_submit"], authentication: "credentials" }, [CONTACT_CREATED_PAYLOAD, FORM_SUBMIT_PAYLOAD]);
    expect(out).toEqual([[{ json: CONTACT_CREATED_PAYLOAD }, { json: FORM_SUBMIT_PAYLOAD }]]);
  });

  it("emits empty output when no webhook payload is received", async () => {
    const out = await runNode(TYPE, { events: ["mautic.lead_post_save_update"], authentication: "credentials" }, []);
    expect(out).toEqual([[]]);
  });
});
