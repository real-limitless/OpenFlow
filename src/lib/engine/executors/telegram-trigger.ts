import type { INodeExecutionData } from "@/sdk";

const RESTRICTED_WILDCARD_CATEGORIES = new Set([
  "chat_member",
  "message_reaction",
  "message_reaction_count",
]);

export const telegramTriggerExecutor = async (
  ctx: { getInputItems: (i?: number) => INodeExecutionData[]; getParam: (name: string, defaultVal?: unknown) => unknown; continueOnFail: () => boolean },
  node: { parameters: Record<string, unknown> },
): Promise<INodeExecutionData[][]> => {
  const items = ctx.getInputItems(0);
  const rawEvents = ctx.getParam("events", ["*"]) as string[];
  const options = (ctx.getParam("options", {}) || {}) as Record<string, unknown>;

  let events = rawEvents;
  if (events.length === 1 && events[0] === "*") {
    events = [
      "message", "edited_message", "channel_post", "edited_channel_post",
      "callback_query", "inline_query", "chosen_inline_result",
      "business_connection", "business_message", "edited_business_message",
      "deleted_business_messages", "chat_boost", "removed_chat_boost",
      "chat_join_request", "my_chat_member", "poll", "poll_answer",
      "pre_checkout_query", "shipping_query", "purchased_paid_media",
    ];
  }

  const eventSet = new Set(events);
  const restrictToChatIds = parseIdList(String(options.restrictToChatIds ?? ""));
  const restrictToUserIds = parseIdList(String(options.restrictToUserIds ?? ""));
  const downloadImages = Boolean(options.downloadImages);
  const imageSize = String(options.imageSize ?? "large");

  const out: INodeExecutionData[] = [];

  for (const item of items) {
    const update = item.json ?? {};
    const category = resolveUpdateCategory(update);

    if (!category || !eventSet.has(category)) continue;

    if (restrictToChatIds.length > 0) {
      const chatId = extractChatId(update);
      if (chatId === null || !restrictToChatIds.includes(chatId)) continue;
    }

    if (restrictToUserIds.length > 0) {
      const userId = extractUserId(update);
      if (userId === null || !restrictToUserIds.includes(userId)) continue;
    }

    const outputItem: INodeExecutionData = { json: update };

    if (downloadImages) {
      try {
        const binaryData = await downloadMediaFromUpdate(update, imageSize);
        if (binaryData) {
          outputItem.binary = binaryData;
        }
      } catch (err) {
        if (!ctx.continueOnFail()) throw err;
      }
    }

    out.push(outputItem);
  }

  return [out];
};

function resolveUpdateCategory(update: Record<string, unknown>): string | null {
  const UPDATE_FIELDS: Record<string, string> = {
    message: "message",
    edited_message: "edited_message",
    channel_post: "channel_post",
    edited_channel_post: "edited_channel_post",
    callback_query: "callback_query",
    inline_query: "inline_query",
    chosen_inline_result: "chosen_inline_result",
    business_connection: "business_connection",
    business_message: "business_message",
    edited_business_message: "edited_business_message",
    deleted_business_messages: "deleted_business_messages",
    chat_boost: "chat_boost",
    removed_chat_boost: "removed_chat_boost",
    chat_join_request: "chat_join_request",
    chat_member: "chat_member",
    my_chat_member: "my_chat_member",
    poll: "poll",
    poll_answer: "poll_answer",
    pre_checkout_query: "pre_checkout_query",
    shipping_query: "shipping_query",
    purchased_paid_media: "purchased_paid_media",
    message_reaction: "message_reaction",
    message_reaction_count: "message_reaction_count",
  };

  for (const [field, cat] of Object.entries(UPDATE_FIELDS)) {
    if (update[field] !== undefined) return cat;
  }

  return null;
}

function extractChatId(update: Record<string, unknown>): number | null {
  const msg = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post ?? update.callback_query ?? update.my_chat_member;
  if (msg && typeof msg === "object") {
    const chat = (msg as Record<string, unknown>).chat;
    if (chat && typeof chat === "object") {
      return Number((chat as Record<string, unknown>).id) || null;
    }
  }
  return null;
}

function extractUserId(update: Record<string, unknown>): number | null {
  const msg = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post ?? update.callback_query;
  if (msg && typeof msg === "object") {
    const from = (msg as Record<string, unknown>).from;
    if (from && typeof from === "object") {
      return Number((from as Record<string, unknown>).id) || null;
    }
  }
  return null;
}

function parseIdList(raw: string): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n));
}

async function downloadMediaFromUpdate(
  update: Record<string, unknown>,
  imageSize: string,
): Promise<Record<string, { data: string; mimeType: string; fileName: string }> | undefined> {
  const msg = update.message ?? update.channel_post ?? update.edited_message;
  if (!msg || typeof msg !== "object") return undefined;

  const photo = (msg as Record<string, unknown>).photo;
  if (!Array.isArray(photo) || photo.length === 0) return undefined;

  const sizeIndex = imageSize === "small" ? 0 : imageSize === "medium" ? Math.floor(photo.length / 2) : photo.length - 1;
  const sizeEntry = photo[sizeIndex] as Record<string, unknown> | undefined;
  const fileId = sizeEntry?.file_id;
  if (!fileId || typeof fileId !== "string") return undefined;

  // TODO: resolve file download via Telegram getFile API using runtime credential
  // The access token is available via ctx.getCredential("telegramApi").
  // For now, attach placeholder metadata without the actual binary.
  return {
    data: {
      data: "",
      mimeType: "image/jpeg",
      fileName: `${fileId}.jpg`,
    },
  };
}
