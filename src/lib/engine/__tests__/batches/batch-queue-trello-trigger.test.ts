import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.trelloTrigger";

const CARD_MOVED_PAYLOAD = {
  action: {
    id: "action123",
    idMemberCreator: "member456",
    type: "updateCard",
    date: "2026-08-02T12:00:00.000Z",
    data: {
      card: { id: "card789", name: "Fix login bug" },
      listBefore: { id: "list111", name: "In Progress" },
      listAfter: { id: "list222", name: "Done" },
      board: { id: "board333", name: "Sprint 42" },
    },
    memberCreator: {
      id: "member456",
      fullName: "Alice",
      username: "alice",
    },
  },
};

const COMMENT_ADDED_PAYLOAD = {
  action: {
    id: "action456",
    idMemberCreator: "member789",
    type: "commentCard",
    date: "2026-08-02T13:00:00.000Z",
    data: {
      card: { id: "card789", name: "Fix login bug" },
      board: { id: "board333", name: "Sprint 42" },
      text: "LGTM, let's merge!",
    },
    memberCreator: {
      id: "member789",
      fullName: "Bob",
      username: "bob",
    },
  },
};

describe("batch-queue trelloTrigger — n8n-nodes-base.trelloTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Trello Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("card_moved_webhook — passes through webhook payload on main output", async () => {
    const out = await runNode(
      TYPE,
      { modelId: "board333" },
      [CARD_MOVED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.action.id).toBe("action123");
    expect(out[0][0].json.action.type).toBe("updateCard");
    expect(out[0][0].json.action.data.card.name).toBe("Fix login bug");
    expect(out[0][0].json.action.data.listBefore.name).toBe("In Progress");
    expect(out[0][0].json.action.data.listAfter.name).toBe("Done");
  });

  it("comment_added_webhook — passes through comment payload", async () => {
    const out = await runNode(
      TYPE,
      { modelId: "board333" },
      [COMMENT_ADDED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.action.id).toBe("action456");
    expect(out[0][0].json.action.type).toBe("commentCard");
    expect(out[0][0].json.action.data.text).toBe("LGTM, let's merge!");
    expect(out[0][0].json.action.memberCreator.fullName).toBe("Bob");
  });

  it("multiple webhook deliveries — each produces one item", async () => {
    const out = await runNode(
      TYPE,
      { modelId: "board333" },
      [CARD_MOVED_PAYLOAD, COMMENT_ADDED_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.action.id).toBe("action123");
    expect(out[0][0].json.action.type).toBe("updateCard");
    expect(out[0][1].json.action.id).toBe("action456");
    expect(out[0][1].json.action.type).toBe("commentCard");
  });

  it("empty input yields single empty item (edge)", async () => {
    const out = await runNode(TYPE, { modelId: "board333" }, []);
    expect(out[0]).toEqual([{ json: {} }]);
  });
});
