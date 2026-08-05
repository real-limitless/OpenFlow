import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { withPairedItem } from "@/sdk";

const API_BASE = "https://api.clockify.me/api/v1";

async function buildHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("clockifyApi");
  const apiKey = cred
    ? String(cred.apiKey ?? cred.accessToken ?? cred.token ?? cred.secret ?? "")
    : "";
  if (!apiKey) {
    throw new Error("Clockify Trigger: clockifyApi credential is not configured");
  }
  return {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };
}

async function clockifyApi<T = unknown>(
  method: string,
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { method, headers, signal: controller.signal });
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (response.status < 200 || response.status >= 300) {
      const detail =
        parsed && typeof parsed === "object"
          ? JSON.stringify(parsed)
          : `HTTP ${response.status}`;
      throw new Error(`Clockify API error: ${detail}`);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Clockify")) throw err;
    throw new Error(`Clockify request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

interface ClockifyTimeEntry {
  id: string;
  description?: string;
  workspaceId: string;
  projectId?: string;
  taskId?: string | null;
  userId: string;
  start: string;
  end: string | null;
  billable?: boolean;
  tagIds?: string[];
  isLocked?: boolean;
  timeInterval: {
    start: string;
    end: string | null;
    duration: string | null;
  };
}

interface ClockifyUser {
  id: string;
  activeWorkspace: string;
  defaultWorkspace?: string;
}

async function getUserId(headers: Record<string, string>): Promise<string> {
  const user = await clockifyApi<ClockifyUser>("GET", `${API_BASE}/user`, headers);
  return user.id;
}

async function getTimeEntries(
  workspaceId: string,
  userId: string,
  start: string,
  end: string,
  headers: Record<string, string>,
): Promise<ClockifyTimeEntry[]> {
  const params = new URLSearchParams({
    start,
    end,
    "page-size": "200",
  });
  const url = `${API_BASE}/workspaces/${workspaceId}/user/${userId}/time-entries?${params.toString()}`;
  return clockifyApi<ClockifyTimeEntry[]>("GET", url, headers);
}

export const clockifyTriggerExecutor: NodeExecutor = async (ctx: ExecutionContext, node: INode) => {
  const workspaceId = ctx.getParam<string>("workspaceId", "");
  const event = ctx.getParam<string>("event", "timeEntry.started");
  const timezoneOverride = ctx.getParam<string>("timezone", "");

  if (!workspaceId) {
    throw new Error("Clockify Trigger: workspaceId is required");
  }

  const headers = await buildHeaders(ctx);
  const userId = await getUserId(headers);

  const now = new Date();

  let pollStart: Date;
  const wf = ctx.getWorkflow();
  const effectiveTz = timezoneOverride || (wf?.settings?.timezone as string | undefined) || "UTC";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: effectiveTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const timeFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: effectiveTz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const datePart = parts
    .filter((p) => p.type === "year" || p.type === "month" || p.type === "day")
    .map((p) => p.value)
    .join("-");

  const timeParts = timeFormatter.formatToParts(now);
  const timePart = timeParts
    .filter((p) => p.type === "hour" || p.type === "minute" || p.type === "second")
    .map((p) => p.value)
    .join(":");

  const nowLocalStr = `${datePart}T${timePart}Z`;

  pollStart = new Date(nowLocalStr);
  pollStart.setMinutes(pollStart.getMinutes() - 3);
  if (pollStart.getTime() > now.getTime()) {
    pollStart = new Date(now.getTime() - 3 * 60 * 1000);
  }

  const startStr = pollStart.toISOString();
  const endStr = now.toISOString();

  const entries = await getTimeEntries(workspaceId, userId, startStr, endStr, headers);

  const matched: ClockifyTimeEntry[] = [];
  for (const entry of entries) {
    const entryStart = new Date(entry.start);
    const entryEnd = entry.end ? new Date(entry.end) : null;

    if (event === "timeEntry.started") {
      if (entryStart >= pollStart && entryStart <= now) {
        matched.push(entry);
      }
    } else if (event === "timeEntry.ended") {
      if (entryEnd && entryEnd >= pollStart && entryEnd <= now) {
        matched.push(entry);
      }
    }
  }

  if (matched.length === 0) {
    return [[]];
  }

  const items: INodeExecutionData[] = matched.map((entry, idx) =>
    withPairedItem({ json: entry as unknown as Record<string, unknown> }, idx),
  );
  return [items];
};
