import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.asanaTrigger";

const EVENT_PAYLOAD = {
  body: {
    events: [
      {
        user: { gid: "111", resource_type: "user", name: "Alice" },
        resource: { gid: "222", resource_type: "task", name: "Fix bug" },
        type: "task",
        action: "added",
        parent: { gid: "1234567890", resource_type: "project", name: "Sprint 3" },
        created_at: "2026-08-03T12:00:00.000Z",
      },
    ],
  },
};

const MULTI_EVENT_PAYLOAD = {
  body: {
    events: [
      {
        user: { gid: "111", resource_type: "user", name: "Alice" },
        resource: { gid: "222", resource_type: "task", name: "Fix bug" },
        type: "task",
        action: "added",
        parent: { gid: "1234567890", resource_type: "project", name: "Sprint 3" },
        created_at: "2026-08-03T12:00:00.000Z",
      },
      {
        user: { gid: "333", resource_type: "user", name: "Bob" },
        resource: { gid: "444", resource_type: "task", name: "Review PR" },
        type: "task",
        action: "changed",
        created_at: "2026-08-03T13:00:00.000Z",
        change: { field: "assignee", action: "changed", new_value: { gid: "333", resource_type: "user" } },
      },
    ],
  },
};

describe("batch-queue asanaTrigger — n8n-nodes-base.asanaTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Asana Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("unwraps events array into individual output items", async () => {
    const out = await runNode(TYPE, {}, [EVENT_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(EVENT_PAYLOAD.body.events[0]);
    const j = out[0][0].json as Record<string, unknown>;
    expect(j.action).toBe("added");
    expect((j.resource as Record<string, unknown>).gid).toBe("222");
  });

  it("multiple events — each produces one output item", async () => {
    const out = await runNode(TYPE, {}, [MULTI_EVENT_PAYLOAD]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect((out[0][0].json as Record<string, unknown>).action).toBe("added");
    expect((out[0][1].json as Record<string, unknown>).action).toBe("changed");
    const j1 = out[0][1].json as Record<string, unknown>;
    expect((j1.change as Record<string, unknown>).field).toBe("assignee");
  });

  it("empty body (heartbeat) yields zero items", async () => {
    const out = await runNode(TYPE, {}, [{ body: {} }]);
    expect(out).toEqual([[]]);
  });

  it("missing events key yields zero items", async () => {
    const out = await runNode(TYPE, {}, [{ body: { unrelated: true } }]);
    expect(out).toEqual([[]]);
  });
});
