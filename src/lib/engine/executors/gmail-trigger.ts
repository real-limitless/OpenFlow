import type { NodeExecutor } from "@/sdk";

const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailToken {
  accessToken: string;
}

async function getToken(ctx: { getCredential(name: string): Promise<unknown> }): Promise<string> {
  const cred = await ctx.getCredential("gmailOAuth2") as GmailToken | null;
  if (!cred?.accessToken) {
    throw new Error("Gmail Trigger: gmailOAuth2 credential is not configured");
  }
  return cred.accessToken;
}

interface GmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: Array<Record<string, unknown>>;
  };
  snippet?: string;
}

async function gmailRequest(
  token: string,
  method: string,
  url: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<unknown> {
  const fullUrl = params ? `${url}?${new URLSearchParams(params).toString()}` : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(fullUrl, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed as Record<string, unknown> | undefined;
      const errMsg = obj?.message
        ? String(obj.message)
        : (obj?.error as Record<string, unknown> | undefined)?.message
          ? String((obj.error as Record<string, unknown>).message)
          : `Gmail API request failed with status code ${response.status}`;
      throw new Error(errMsg);
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Gmail")) throw err;
    throw new Error(`Gmail request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function extractHeaders(msg: GmailMessage): Record<string, string> {
  const payload = msg.payload;
  const headersArr = (payload?.headers ?? []) as Array<{ name: string; value: string }>;
  const out: Record<string, string> = {};
  for (const h of headersArr) {
    out[h.name] = h.value;
  }
  return out;
}

function simplifyMessage(msg: GmailMessage): Record<string, unknown> {
  const headers = extractHeaders(msg);
  return {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds ?? [],
    subject: headers["Subject"] ?? "",
    from: headers["From"] ?? "",
    to: headers["To"] ?? "",
    cc: headers["Cc"] ?? "",
    bcc: headers["Bcc"] ?? "",
    date: headers["Date"] ?? "",
  };
}

function buildSearchQuery(params: {
  includeSpamAndTrash: boolean;
  search: string;
  readStatus: string;
  sender: string;
}): string {
  const parts: string[] = [];
  if (params.sender) parts.push(`from:${params.sender}`);
  if (params.search) parts.push(params.search);
  if (params.readStatus === "unreadOnly") parts.push("is:unread");
  else if (params.readStatus === "readOnly") parts.push("is:read");
  return parts.join(" ");
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

export const gmailTriggerExecutor: NodeExecutor = async (ctx) => {
  const token = await getToken(ctx);
  const simplify = ctx.getParam("simplify", true) as boolean;
  const maxEmails = Math.min(Math.max(Number(ctx.getParam("maxEmailsPerPoll", 10)) || 10, 1), 50);
  const filters = ctx.getParam("filters", {}) as Record<string, unknown>;
  const pollTimes = ctx.getParam("pollTimes", {}) as Record<string, unknown>;

  if (!pollTimes.mode) {
    return [[]];
  }

  const includeSpamAndTrash = Boolean(filters.includeSpamAndTrash);
  const search = String(filters.search ?? "");
  const readStatus = String(filters.readStatus ?? "unreadOnly");
  const sender = String(filters.sender ?? "");
  const labelIds = (filters.labelIds ?? []) as string[];

  const query = buildSearchQuery({ includeSpamAndTrash, search, readStatus, sender });

  const params: Record<string, string> = {
    maxResults: String(maxEmails),
  };
  if (query) params.q = query;
  if (!includeSpamAndTrash) params.includeSpamAndTrash = "false";
  if (labelIds.length > 0) params.labelIds = labelIds.join(",");

  const listRes = await gmailRequest(token, "GET", `${API_BASE}/messages`, undefined, {
    maxResults: String(maxEmails),
    q: query,
    ...(labelIds.length > 0 ? { labelIds: labelIds.join(",") } : {}),
  });

  const list = listRes as { messages?: Array<{ id: string }> };
  const messages = list.messages ?? [];
  const state = getPollState(ctx);

  const idsFromQueue: string[] = [];
  const allIds = [...state.queuedIds, ...messages.map((m) => m.id)];
  const newIds: string[] = [];

  for (const id of allIds) {
    if (!id) continue;
    if (state.seenIds.has(id)) continue;
    if (newIds.length >= maxEmails) {
      idsFromQueue.push(id);
      continue;
    }
    state.seenIds.add(id);
    newIds.push(id);
  }

  state.queuedIds = idsFromQueue;

  if (newIds.length === 0) {
    return [[]];
  }

  const items = [];
  for (const messageId of newIds) {
    const msgRes = await gmailRequest(token, "GET", `${API_BASE}/messages/${messageId}`);
    const msg = msgRes as GmailMessage;
    if (simplify) {
      items.push({ json: simplifyMessage(msg) });
    } else {
      items.push({ json: msg as unknown as Record<string, unknown> });
    }
  }

  return [items];
};
