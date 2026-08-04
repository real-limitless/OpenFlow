import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.clickUpTrigger";

const TASK_CREATED_PAYLOAD = {
  event: "taskCreated",
  history_items: [
    {
      id: "8a2f82db-7718-4fdb-9493-4849e67f009d",
      type: 6,
      date: "1642740510345",
      user: { id: 183, username: "John" },
      before: null,
      after: null,
    },
  ],
  list_id: "162641285",
  task_id: "abc1234",
  webhook_id: "7fa3ec74-69a8-4530-a251-8a13730bd204",
};

const LIST_CREATED_PAYLOAD = {
  event: "listCreated",
  list_id: "162641286",
  webhook_id: "7fa3ec74-69a8-4530-a251-8a13730bd205",
};

describe("batch-queue clickUpTrigger — n8n-nodes-base.clickUpTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ClickUp Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("task created — passes through payload with envelope fields", async () => {
    const out = await runNode(
      TYPE,
      { teamId: { mode: "list", value: "team_abc" }, events: ["task"] },
      [TASK_CREATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("taskCreated");
    expect(out[0][0].json.task_id).toBe("abc1234");
    expect(out[0][0].json.webhook_id).toBe("7fa3ec74-69a8-4530-a251-8a13730bd204");
  });

  it("list created — passes through payload", async () => {
    const out = await runNode(
      TYPE,
      { teamId: { mode: "list", value: "team_abc" }, events: ["list"] },
      [LIST_CREATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.event).toBe("listCreated");
    expect(out[0][0].json.list_id).toBe("162641286");
  });

  it("multiple payloads — each produces one output item", async () => {
    const out = await runNode(
      TYPE,
      { teamId: { mode: "list", value: "team_abc" }, events: ["task", "list"] },
      [TASK_CREATED_PAYLOAD, LIST_CREATED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.event).toBe("taskCreated");
    expect(out[0][1].json.event).toBe("listCreated");
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(
      TYPE,
      { teamId: { mode: "list", value: "team_abc" }, events: ["task"] },
      [],
    );
    expect(out).toEqual([[]]);
  });
});
