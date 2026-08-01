import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.telegramTrigger";

const MESSAGE_UPDATE = {
  update_id: 1,
  message: {
    message_id: 42,
    date: 1700000000,
    chat: { id: 987654321, type: "private" },
    from: { id: 12345, is_bot: false, first_name: "Ada" },
    text: "hello",
  },
};

const CALLBACK_QUERY_UPDATE = {
  update_id: 2,
  callback_query: {
    id: "cq1",
    from: { id: 12345, is_bot: false, first_name: "Ada" },
    data: "approve",
  },
};

const MESSAGE_REACTION_UPDATE = {
  update_id: 3,
  message_reaction: {
    chat: { id: 987654321, type: "private" },
    user: { id: 12345, is_bot: false, first_name: "Ada" },
    date: 1700000001,
  },
};

const PHOTO_UPDATE = {
  update_id: 4,
  message: {
    message_id: 43,
    date: 1700000002,
    chat: { id: 987654321, type: "private" },
    from: { id: 12345, is_bot: false, first_name: "Ada" },
    photo: [
      { file_id: "small_id", file_size: 100, width: 100, height: 100 },
      { file_id: "medium_id", file_size: 500, width: 400, height: 400 },
      { file_id: "large_id", file_size: 2000, width: 800, height: 800 },
    ],
  },
};

describe("batch-queue telegramTrigger — n8n-nodes-base.telegramTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Telegram Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("basic message update passes through with wildcard", async () => {
    const out = await runNode(TYPE, { events: ["*"] }, [MESSAGE_UPDATE]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(MESSAGE_UPDATE);
  });

  it("event category filtering — callback_query not matched when only message requested", async () => {
    const out = await runNode(TYPE, { events: ["callback_query"] }, [MESSAGE_UPDATE]);
    expect(out).toEqual([[]]);
  });

  it("callback_query event matches callback_query update", async () => {
    const out = await runNode(TYPE, { events: ["callback_query"] }, [CALLBACK_QUERY_UPDATE]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(CALLBACK_QUERY_UPDATE);
  });

  it("wildcard excludes message_reaction", async () => {
    const out = await runNode(TYPE, { events: ["*"] }, [MESSAGE_REACTION_UPDATE]);
    expect(out).toEqual([[]]);
  });

  it("chat ID restriction — matching chat passes", async () => {
    const out = await runNode(
      TYPE,
      { events: ["*"], options: { restrictToChatIds: "987654321" } },
      [MESSAGE_UPDATE],
    );
    expect(out[0]).toHaveLength(1);
  });

  it("chat ID restriction — non-matching chat is filtered", async () => {
    const out = await runNode(
      TYPE,
      { events: ["*"], options: { restrictToChatIds: "111222333" } },
      [MESSAGE_UPDATE],
    );
    expect(out).toEqual([[]]);
  });

  it("downloadImages adds binary data to the item", async () => {
    const out = await runNode(
      TYPE,
      { events: ["*"], options: { downloadImages: true, imageSize: "large" } },
      [PHOTO_UPDATE],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(PHOTO_UPDATE);
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!.data).toBeDefined();
    expect(out[0][0].binary!.data.fileName).toContain(".jpg");
  });

  it("empty input yields empty output", async () => {
    const out = await runNode(TYPE, { events: ["*"] }, []);
    expect(out).toEqual([[]]);
  });

  it("imageSize=small selects first photo", async () => {
    const out = await runNode(
      TYPE,
      { events: ["*"], options: { downloadImages: true, imageSize: "small" } },
      [PHOTO_UPDATE],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toBeDefined();
  });
});
