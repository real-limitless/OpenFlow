import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.zendeskTrigger";

describe("batch-queue zendesk-trigger — n8n-nodes-base.zendeskTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Zendesk Trigger");
  });

  it("basic webhook receive — matching event", async () => {
    const body = { type: "ticket.created", payload: { id: 456 } };
    const [out] = await runNode(TYPE, { event: "ticket.created" }, [body]);

    expect(out).toHaveLength(1);
    expect(out[0].json.type).toBe("ticket.created");
    expect((out[0].json as Record<string, unknown>).payload).toEqual({ id: 456 });
  });

  it("non-matching event type produces no output", async () => {
    const [out] = await runNode(
      TYPE,
      { event: "organization.created" },
      [{ type: "ticket.created", payload: { id: 456 } }],
    );

    expect(out).toHaveLength(0);
  });

  it("wildcard event matches any type", async () => {
    const [out] = await runNode(TYPE, { event: "*" }, [
      { type: "ticket.deleted", payload: { id: 789 } },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].json.type).toBe("ticket.deleted");
  });

  it("filter sub-conditions narrow output", async () => {
    const params = {
      event: "ticket.updated",
      filter: { status: "solved" },
    };

    const [out] = await runNode(TYPE, params, [
      { type: "ticket.updated", payload: { id: 1, status: "open" } },
      { type: "ticket.updated", payload: { id: 2, status: "solved" } },
    ]);

    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).payload).toEqual({ id: 2, status: "solved" });
  });

  it("empty input emits a single empty item", async () => {
    const [out] = await runNode(TYPE, { event: "*" }, []);
    expect(out).toEqual([{ json: {} }]);
  });
});
