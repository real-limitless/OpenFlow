import type { NodeExecutor } from "@/sdk";

const API_BASE = "https://graph.microsoft.com/v1.0";

interface OutlookToken {
  accessToken: string;
}

async function getToken(ctx: { getCredential(name: string): Promise<unknown> }): Promise<string> {
  const credNames = [
    "microsoftOutlookOAuth2Api",
    "microsoftOAuth2Api",
    "microsoftEntraServicePrincipalApi",
  ];
  for (const name of credNames) {
    const cred = await ctx.getCredential(name) as OutlookToken | null;
    if (cred?.accessToken) return cred.accessToken;
  }
  throw new Error("Microsoft Outlook Trigger: no valid credential found");
}

interface GraphMessage {
  id?: string;
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  bodyPreview?: string;
  webLink?: string;
  [key: string]: unknown;
}

async function graphRequest(
  token: string,
  url: string,
  params?: Record<string, string>,
): Promise<unknown> {
  const fullUrl = params ? `${url}?${new URLSearchParams(params).toString()}` : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed as Record<string, unknown> | undefined;
      const errMsg: string = obj?.message
        ? String(obj.message)
        : (obj?.error as Record<string, unknown> | undefined)?.message
          ? String((obj.error as Record<string, unknown>).message ?? "")
          : `Microsoft Graph API request failed with status ${response.status}`;
      throw new Error(errMsg);
    }
    return parsed;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("Microsoft")) throw err;
    throw new Error(`Microsoft Graph request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function simplifyMessage(msg: GraphMessage): Record<string, unknown> {
  return {
    id: msg.id,
    subject: msg.subject ?? "",
    from: msg.from?.emailAddress?.address ?? "",
    fromName: msg.from?.emailAddress?.name ?? "",
    toRecipients: msg.toRecipients ?? [],
    receivedDateTime: msg.receivedDateTime ?? "",
    bodyPreview: msg.bodyPreview ?? "",
    webLink: msg.webLink ?? "",
  };
}

interface PollState {
  seenIds: Set<string>;
  queuedIds: string[];
}

const pollStates = new Map<string, PollState>();

export function _clearPollStatesForTest(): void {
  pollStates.clear();
}

function getPollState(ctx: { node: { id?: string } }): PollState {
  const id = ctx.node.id ?? "default";
  let state = pollStates.get(id);
  if (!state) {
    state = { seenIds: new Set(), queuedIds: [] };
    pollStates.set(id, state);
  }
  return state;
}

export const microsoftOutlookTriggerExecutor: NodeExecutor = async (ctx) => {
  const token = await getToken(ctx);
  const event = ctx.getParam("event", "messageReceived") as string;
  const simplify = ctx.getParam("simplify", true) as boolean;
  const folders = ctx.getParam("folders", ["Inbox"]) as string[];
  const pollTimes = ctx.getParam("pollTimes", {}) as Record<string, unknown>;

  if (event !== "messageReceived") {
    return [[]];
  }
  if (!pollTimes.mode) {
    return [[]];
  }

  const DISCOVERY_CAP = 500;
  const state = getPollState(ctx);
  const allDiscovered: GraphMessage[] = [];

  for (const folderId of folders) {
    const queryParams: Record<string, string> = {
      $orderby: "receivedDateTime desc",
      $top: String(DISCOVERY_CAP),
      $select: "id,subject,receivedDateTime,from,toRecipients,bodyPreview,webLink",
    };
    let pageToken: string | undefined;
    do {
      if (pageToken) {
        queryParams.$skip = pageToken;
      }
      const folderPath = folderId === "Inbox" ? "inbox" : `mailFolders/${encodeURIComponent(folderId)}`;
      const url = `${API_BASE}/me/${folderPath}/messages`;
      const pageRes = await graphRequest(token, url, queryParams);
      const page = pageRes as { value?: GraphMessage[]; "@odata.nextLink"?: string };
      allDiscovered.push(...(page.value ?? []));
      pageToken = page["@odata.nextLink"];
      delete queryParams.$skip;
    } while (pageToken && allDiscovered.length < DISCOVERY_CAP);
  }

  if (allDiscovered.length === 0) {
    return [[]];
  }

  const idsFromQueue: string[] = [];
  const allIds = [...state.queuedIds, ...allDiscovered.map((m) => m.id).filter(Boolean)];
  const newMessages: GraphMessage[] = [];

  for (const id of allIds) {
    if (!id) continue;
    if (state.seenIds.has(id)) continue;
    state.seenIds.add(id);
    const match = allDiscovered.find((m) => m.id === id);
    if (match) {
      newMessages.push(match);
    }
  }

  state.queuedIds = idsFromQueue;

  if (newMessages.length === 0) {
    return [[]];
  }

  const items = newMessages.map((msg) => {
    if (simplify) {
      return { json: simplifyMessage(msg) };
    }
    return { json: msg as unknown as Record<string, unknown> };
  });

  return [items];
};
