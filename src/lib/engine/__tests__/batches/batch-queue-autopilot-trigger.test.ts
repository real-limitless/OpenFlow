import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.autopilotTrigger";

const CONTACT_ADDED_PAYLOAD = {
  contact: {
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Example",
    created_at: "2024-01-15T10:30:00Z",
  },
  event: "contact_added",
  timestamp: 1705312200,
};

const CONTACT_UPDATED_PAYLOAD = {
  contact: {
    email: "bob@example.com",
    firstName: "Bob",
    lastName: "Updated",
    updated_at: "2024-02-20T14:00:00Z",
  },
  event: "contact_updated",
  timestamp: 1708437600,
};

describe("batch-queue autopilotTrigger — n8n-nodes-base.autopilotTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Autopilot Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("contact added event fires output", async () => {
    const out = await runNode(TYPE, { event: "contactAdded" }, [CONTACT_ADDED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(CONTACT_ADDED_PAYLOAD);
  });

  it("contact updated event fires output", async () => {
    const out = await runNode(TYPE, { event: "contactUpdated" }, [CONTACT_UPDATED_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(CONTACT_UPDATED_PAYLOAD);
  });

  it("empty input emits a single empty item", async () => {
    const out = await runNode(TYPE, { event: "contactAdded" }, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("invalid event value throws", async () => {
    await expect(runNode(TYPE, { event: "invalidEvent" }, [{}])).rejects.toThrow(
      /Invalid Autopilot event/,
    );
  });
});
