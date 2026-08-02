import type { NodeExecutor } from "@/sdk";

const DRIVE_CHANGES_API = "https://www.googleapis.com/drive/v3/changes";
const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";

const EVENT_TO_CHANGE_TYPE: Record<string, string> = {
  fileCreated: "create",
  fileUpdated: "edit",
  fileDeleted: "delete",
  folderCreated: "create",
  folderUpdated: "edit",
  folderDeleted: "delete",
};

const EVENT_IS_FOLDER: Record<string, boolean> = {
  fileCreated: false,
  fileUpdated: false,
  fileDeleted: false,
  folderCreated: true,
  folderUpdated: true,
  folderDeleted: true,
};

interface PollState {
  cursor: string;
  seenIds: Set<string>;
}

const pollStates = new Map<string, PollState>();

export function _clearPollStatesForTest(): void {
  pollStates.clear();
}

function getPollState(nodeId: string): PollState {
  let state = pollStates.get(nodeId);
  if (!state) {
    state = { cursor: "0", seenIds: new Set() };
    pollStates.set(nodeId, state);
  }
  return state;
}

async function driveApiRequest(
  token: string,
  method: string,
  url: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method,
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
      const msg = err?.message ?? String(obj.message ?? `HTTP ${res.status}`);
      throw new Error(`GoogleDrive Trigger: ${msg}`);
    }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function getFileMetadata(
  token: string,
  fileId: string,
): Promise<Record<string, unknown> | null> {
  const url = `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,modifiedTime,size,trashed,webViewLink,lastModifyingUser`;
  try {
    const res = await driveApiRequest(token, "GET", url);
    return (res.body as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

export const googleDriveTriggerExecutor: NodeExecutor = async (ctx) => {
  const cred = await ctx.getCredential("googleDriveOAuth2Api");
  if (!cred) {
    throw new Error("GoogleDrive Trigger: googleDriveOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("GoogleDrive Trigger: googleDriveOAuth2Api credential has no accessToken");
  }

  const event = String(ctx.getParam("event", "fileCreated"));
  const triggerOn = String(ctx.getParam("triggerOn", "specificFolder"));
  const folderToWatch = String(ctx.getParam("folderToWatch", ""));
  const options = (ctx.getParam("options", {}) ?? {}) as Record<string, unknown>;
  const fileTypeFilter = String(options.fileType ?? "all");

  const workflow = ctx.getWorkflow();
  const isManual =
    workflow.active === false ||
    ctx.getCustomData("triggerMode") === "manual";

  const nodeId = ctx.node.id ?? "default";
  const state = getPollState(nodeId);

  const expectedChangeType = EVENT_TO_CHANGE_TYPE[event] ?? "create";
  const isFolderEvent = EVENT_IS_FOLDER[event] ?? false;

  const params: Record<string, string> = {
    pageSize: "100",
    fields: "changes(type,fileId,file(id,name,mimeType,parents,modifiedTime,size,trashed,webViewLink,lastModifyingUser),removed,time),nextPageToken,newStartPageToken",
  };
  if (state.cursor !== "0") {
    params.pageToken = state.cursor;
  } else {
    const startRes = await driveApiRequest(
      accessToken,
      "GET",
      `${DRIVE_CHANGES_API}/startPageToken`,
    );
    const startBody = startRes.body as Record<string, unknown> ?? {};
    params.pageToken = String(startBody.startPageToken ?? "0");
  }

  const allChanges: Array<Record<string, unknown>> = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams(params).toString();
    const res = await driveApiRequest(accessToken, "GET", `${DRIVE_CHANGES_API}?${qs}`);
    const body = (res.body as Record<string, unknown>) ?? {};
    const changes = (body.changes as Array<Record<string, unknown>>) ?? [];
    allChanges.push(...changes);
    nextPageToken = body.nextPageToken as string | undefined;
    if (!nextPageToken) {
      nextPageToken = body.newStartPageToken as string | undefined;
      break;
    }
    params.pageToken = nextPageToken;
  }

  state.cursor = nextPageToken ?? state.cursor;

  const items: Array<{ json: Record<string, unknown> }> = [];

  for (const change of allChanges) {
    const changeType = String(change.type ?? "");
    const fileId = String(change.fileId ?? "");
    const removed = change.removed === true;
    const file = change.file as Record<string, unknown> | undefined;

    if (!fileId) continue;

    let mimeType = String(file?.mimeType ?? "");
    if (!mimeType && removed) {
      const meta = await getFileMetadata(accessToken, fileId);
      if (meta) {
        mimeType = String(meta.mimeType ?? "");
      }
    }
    if (!mimeType) continue;

    const actualIsFolder =
      mimeType === "application/vnd.google-apps.folder";

    if (isFolderEvent !== actualIsFolder) continue;

    if (expectedChangeType === "create" && changeType !== "create") continue;
    if (expectedChangeType === "edit" && changeType !== "edit") continue;
    if (expectedChangeType === "delete" && changeType !== "delete" && !removed) continue;

    if (fileTypeFilter !== "all" && !removed) {
      if (mimeType !== fileTypeFilter) continue;
    }

    if (triggerOn === "specificFolder" && folderToWatch) {
      const parents = (file?.parents as string[]) ?? [];
      if (!parents.includes(folderToWatch) && fileId !== folderToWatch) {
        if (removed) {
          const meta = await getFileMetadata(accessToken, fileId);
          const removedParents = (meta?.parents as string[]) ?? [];
          if (!removedParents.includes(folderToWatch)) continue;
        } else {
          continue;
        }
      }
    }

    if (!isManual) {
      if (state.seenIds.has(fileId)) continue;
      state.seenIds.add(fileId);
    }

    const resource = file as Record<string, unknown> ?? {};
    items.push({
      json: {
        id: fileId,
        name: resource.name ?? "",
        mimeType,
        parents: resource.parents,
        modifiedTime: resource.modifiedTime,
        size: resource.size,
        trashed: resource.trashed,
        webViewLink: resource.webViewLink,
        lastModifyingUser: resource.lastModifyingUser,
        changeType,
        removed,
      },
    });
  }

  if (isManual) {
    if (items.length === 0) {
      throw new Error("GoogleDrive Trigger: no matching event was found");
    }
    return [[items[items.length - 1]]];
  }

  if (items.length === 0) {
    return [[]];
  }

  return [items];
};
