import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface SlackEventPayload {
  token?: string;
  type?: string;
  event?: {
    type?: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    reaction?: string;
    file?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const EVENT_FAMILY_MAP: Record<string, string[]> = {
  "*": [],
  app_home_opened: ["app_home_opened"],
  app_mention: ["app_mention"],
  file_public: ["file_public"],
  file_shared: ["file_shared"],
  message: ["message"],
  channel_created: ["channel_created"],
  team_join: ["team_join"],
  reaction_added: ["reaction_added"],
};

function matchesEvent(selectedEvents: string[], eventType: string): boolean {
  if (selectedEvents.includes("*")) return true;
  for (const sel of selectedEvents) {
    const mapped = EVENT_FAMILY_MAP[sel];
    if (mapped && mapped.includes(eventType)) return true;
    if (mapped && mapped.length === 0 && sel === eventType) return true;
    if (sel === eventType) return true;
  }
  return false;
}

function getUserList(ignoreUsers: string): string[] {
  return ignoreUsers
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

function matchesEmojiFilter(emojiFilter: string, reaction: string): boolean {
  if (!emojiFilter) return true;
  const allowed = emojiFilter
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(reaction);
}

function getChannelValue(channelParam: unknown): string | undefined {
  if (!channelParam) return undefined;
  if (typeof channelParam === "string") return channelParam;
  if (typeof channelParam === "object" && channelParam !== null) {
    const p = channelParam as Record<string, unknown>;
    if (p.value && typeof p.value === "string") return p.value;
    if (p.mode === "id" && p.value && typeof p.value === "string") return p.value;
  }
  return undefined;
}

export const slackTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const events = ctx.getParam<string[]>("events", []);
  const watchWholeWorkspace = ctx.getParam<boolean>("watchWholeWorkspace", false);
  const channel = getChannelValue(ctx.getParam<unknown>("channel", undefined));
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const ignoreUsers = getUserList(String(options.ignoreUsers ?? ""));
  const emojiFilter = String(options.emojiFilter ?? "");

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const payload = item.json as SlackEventPayload;
    if (payload.type !== "event_callback") continue;
    const event = payload.event;
    if (!event || !event.type) continue;

    if (!matchesEvent(events, event.type)) continue;

    if (!watchWholeWorkspace && channel) {
      if (event.channel !== channel) continue;
    }

    if (ignoreUsers.length > 0 && event.user) {
      if (ignoreUsers.includes(event.user)) continue;
    }

    if (event.type === "reaction_added" && emojiFilter) {
      if (!matchesEmojiFilter(emojiFilter, event.reaction ?? "")) continue;
    }

    out.push({ json: payload });
  }

  return [out];
};
