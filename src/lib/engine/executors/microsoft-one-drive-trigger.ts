import type { NodeExecutor } from "@/sdk";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface DeltaState {
  deltaLink: string | null;
  seenIds: Set<string>;
  lastModifiedById: Map<string, string>;
}

const pollStates = new Map<string, DeltaState>();

export function _clearPollStatesForTest(): void {
  pollStates.clear();
}

function getPollState(nodeId: string): DeltaState {
  let state = pollStates.get(nodeId);
  if (!state) {
    state = { deltaLink: null, seenIds: new Set(), lastModifiedById: new Map() };
    pollStates.set(nodeId, state);
  }
  return state;
}

async function graphApiRequest(
  token: string,
  url: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (res.status < 200 || res.status >= 300) {
      const obj = (parsed as Record<string, unknown>) ?? {};
      const err = obj.error as Record<string, unknown> | undefined;
      if (res.status === 410) {
        return { status: 410, body: parsed };
      }
      const msg = err?.message ?? String(obj.message ?? `HTTP ${res.status}`);
      throw new Error(`MicrosoftOneDrive Trigger: ${msg}`);
    }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

export const microsoftOneDriveTriggerExecutor: NodeExecutor = async (ctx) => {
  const cred = await ctx.getCredential("microsoftOneDriveOAuth2Api");
  if (!cred) {
    throw new Error("MicrosoftOneDrive Trigger: microsoftOneDriveOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("MicrosoftOneDrive Trigger: microsoftOneDriveOAuth2Api credential has no accessToken");
  }

  const event = String(ctx.getParam("event", "fileCreated"));
  const nodeId = ctx.node.id ?? "default";
  const state = getPollState(nodeId);

  const expectedEvents: string[] = [];
  try {
    const raw = ctx.getParam("events");
    if (Array.isArray(raw)) {
      expectedEvents.push(...raw.map(String));
    }
  } catch {
    // fallback
  }
  if (expectedEvents.length === 0) {
    expectedEvents.push(event);
  }

  const isColdStart = state.deltaLink === null;
  let wasResync = false;

  let deltaUrl: string;
  if (isColdStart) {
    deltaUrl = `${GRAPH_BASE}/me/drive/root/delta`;
  } else {
    deltaUrl = state.deltaLink!;
  }

  let response = await graphApiRequest(accessToken, deltaUrl);
  if (response.status === 410) {
    state.deltaLink = null;
    state.seenIds.clear();
    state.lastModifiedById.clear();
    wasResync = true;
    deltaUrl = `${GRAPH_BASE}/me/drive/root/delta`;
    response = await graphApiRequest(accessToken, deltaUrl);
  }

  const allItems: Array<Record<string, unknown>> = [];
  let body = response.body as Record<string, unknown> ?? {};

  let pages = 0;
  while (pages < 10) {
    const value = body.value as Array<Record<string, unknown>> ?? [];
    allItems.push(...value);
    const nextLink = body["@odata.nextLink"] as string | undefined;
    const deltaLink = body["@odata.deltaLink"] as string | undefined;
    if (deltaLink) {
      state.deltaLink = deltaLink;
      break;
    }
    if (!nextLink) break;
    const pageRes = await graphApiRequest(accessToken, nextLink);
    body = (pageRes.body as Record<string, unknown>) ?? {};
    pages++;
  }

  if (isColdStart || wasResync) {
    for (const item of allItems) {
      const id = String(item.id ?? "");
      if (!id) continue;
      state.seenIds.add(id);
      const lastModified = String(item.lastModifiedDateTime ?? "");
      if (lastModified) {
        state.lastModifiedById.set(id, lastModified);
      }
    }
    return [[]];
  }

  const items: Array<{ json: Record<string, unknown> }> = [];

  for (const item of allItems) {
    const id = String(item.id ?? "");
    if (!id) continue;

    if (item.deleted) continue;

    const file = item.file as Record<string, unknown> | undefined;
    const folder = item.folder as Record<string, unknown> | undefined;
    const lastModified = String(item.lastModifiedDateTime ?? "");

    let classification: string | null = null;

    if (file) {
      if (!state.seenIds.has(id)) {
        classification = "fileCreated";
      } else {
        const prevModified = state.lastModifiedById.get(id);
        if (prevModified !== undefined && lastModified !== prevModified) {
          classification = "fileUpdated";
        }
      }
    } else if (folder) {
      if (!state.seenIds.has(id)) {
        classification = "folderCreated";
      } else {
        const prevModified = state.lastModifiedById.get(id);
        if (prevModified !== undefined && lastModified !== prevModified) {
          classification = "folderUpdated";
        }
      }
    }

    if (classification && expectedEvents.includes(classification)) {
      items.push({ json: { ...item } as Record<string, unknown> });
    }

    state.seenIds.add(id);
    if (lastModified) {
      state.lastModifiedById.set(id, lastModified);
    }
  }

  return [items];
};
