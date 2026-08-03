import type { NodeExecutor } from "@/sdk";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface OAuth2Cred {
  accessToken: string;
}

async function getToken(ctx: { getCredential(name: string): Promise<unknown> }): Promise<string> {
  const cred = await ctx.getCredential("googleCalendarOAuth2Api") as OAuth2Cred | null;
  if (!cred?.accessToken) {
    throw new Error("GoogleCalendarTrigger: googleCalendarOAuth2Api credential is not configured");
  }
  return cred.accessToken;
}

async function calendarRequest(
  token: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
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
    const errObj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    const msg =
      ((errObj.error as { message?: string } | undefined)?.message) ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleCalendarTrigger: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function resolveCalendarId(raw: unknown): string {
  if (!raw) return "primary";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>).value ?? "primary");
  }
  return "primary";
}

function matchesSearchTerm(event: Record<string, unknown>, term: string): boolean {
  if (!term) return true;
  const lower = term.toLowerCase();
  const fields = [
    String(event.summary ?? ""),
    String(event.description ?? ""),
    String(event.location ?? ""),
  ];
  return fields.some((f) => f.toLowerCase().includes(lower));
}

function eventMatchesTrigger(
  event: Record<string, unknown>,
  triggerOn: string,
  matchTerm: string,
): boolean {
  if (triggerOn === "eventCreated") {
    if (event.status === "cancelled") return false;
    const created = String(event.created ?? "");
    const updated = String(event.updated ?? "");
    const createdTime = new Date(created).getTime();
    const updatedTime = new Date(updated).getTime();
    if (!created || isNaN(createdTime)) return false;
    if (updatedTime < createdTime) return false;
    return matchesSearchTerm(event, matchTerm);
  }
  if (triggerOn === "eventUpdated") {
    if (event.status === "cancelled") return false;
    const updated = String(event.updated ?? "");
    const created = String(event.created ?? "");
    if (!updated || updated === created) return false;
    return matchesSearchTerm(event, matchTerm);
  }
  if (triggerOn === "eventCancelled") {
    if (event.status !== "cancelled") return false;
    const updated = String(event.updated ?? "");
    const created = String(event.created ?? "");
    if (!updated || updated === created) return false;
    return matchesSearchTerm(event, matchTerm);
  }
  return matchesSearchTerm(event, matchTerm);
}

function formatEventOutput(e: Record<string, unknown>) {
  return {
    id: e.id,
    summary: e.summary ?? "",
    description: e.description ?? "",
    location: e.location ?? "",
    start: e.start,
    end: e.end,
    status: e.status ?? "",
    htmlLink: e.htmlLink ?? "",
    created: e.created ?? "",
    updated: e.updated ?? "",
    creator: e.creator,
    organizer: e.organizer,
  } as Record<string, unknown>;
}

/** Per-test: clear all in-memory static data. */
const staticDataStore = new Map<string, Record<string, unknown>>();

export function _clearStaticDataForTest(): void {
  staticDataStore.clear();
}

function getStaticData(nodeId: string): Record<string, unknown> {
  let data = staticDataStore.get(nodeId);
  if (!data) {
    data = {};
    staticDataStore.set(nodeId, data);
  }
  return data;
}

export const googleCalendarTriggerExecutor: NodeExecutor = async (ctx) => {
  const token = await getToken(ctx);

  const pollTimes = ctx.getParam("pollTimes", {}) as Record<string, unknown>;
  const calendarId = resolveCalendarId(ctx.getParam("calendarId"));
  const triggerOn = String(ctx.getParam("triggerOn", "eventCreated"));
  const options = (ctx.getParam("options", {}) as Record<string, unknown>);
  const matchTerm = String(options.matchTerm ?? "");

  const isManual = !pollTimes || !(pollTimes as Record<string, unknown>).item;

  const nodeId = ctx.node.id ?? "default";
  const staticData = getStaticData(nodeId);

  const now = new Date();
  const nowIso = now.toISOString();

  if (isManual) {
    const qs = new URLSearchParams({
      maxResults: "1",
      singleEvents: "true",
    }).toString();
    const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${qs}`;
    const res = await calendarRequest(token, "GET", url);
    const body = (res.body as Record<string, unknown>) ?? {};
    const events = (body.items as Array<Record<string, unknown>>) ?? [];

    const filtered = events.filter((e) => eventMatchesTrigger(e, triggerOn, matchTerm));
    const items = filtered.map((e) => ({ json: formatEventOutput(e) }));
    return [items];
  }

  const lastPollTime = staticData.lastPollTime as string | undefined;

  if (!lastPollTime) {
    staticData.lastPollTime = nowIso;
    if (triggerOn === "eventUpdated") {
      staticData.seenUpdated = {};
    }
    return [[]];
  }

  let apiUrl: string;
  const triggersWithUpdatedMin = ["eventCreated", "eventUpdated", "eventCancelled"];
  const triggersWithTimeWindow = ["eventStarted", "eventEnded"];

  if (triggersWithUpdatedMin.includes(triggerOn)) {
    const params: Record<string, string> = {
      updatedMin: lastPollTime,
      orderBy: "updated",
      singleEvents: "true",
      maxResults: "250",
    };
    if (triggerOn === "eventCancelled") {
      params.showDeleted = "true";
    }
    if (matchTerm) {
      params.q = matchTerm;
    }
    const qs = new URLSearchParams(params).toString();
    apiUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${qs}`;
  } else if (triggersWithTimeWindow.includes(triggerOn)) {
    const params: Record<string, string> = {
      timeMin: lastPollTime,
      timeMax: nowIso,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    };
    if (matchTerm) {
      params.q = matchTerm;
    }
    const qs = new URLSearchParams(params).toString();
    apiUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${qs}`;
  } else {
    return [[]];
  }

  const res = await calendarRequest(token, "GET", apiUrl);
  const body = (res.body as Record<string, unknown>) ?? {};
  const events = (body.items as Array<Record<string, unknown>>) ?? [];

  staticData.lastPollTime = nowIso;

  if (triggerOn === "eventCreated") {
    const filtered = events.filter((e) => {
      if (e.status === "cancelled") return false;
      const created = String(e.created ?? "");
      if (!created) return false;
      const createdTime = new Date(created).getTime();
      const windowStart = new Date(lastPollTime).getTime();
      if (createdTime < windowStart || createdTime > now.getTime()) return false;
      return matchesSearchTerm(e, matchTerm);
    });
    if (filtered.length === 0) return [[]];
    return [filtered.map((e) => ({ json: formatEventOutput(e) }))];
  }

  if (triggerOn === "eventUpdated") {
    const seenUpdated = (staticData.seenUpdated as Record<string, string>) ?? {};

    const filtered = events.filter((e) => {
      if (e.status === "cancelled") return false;
      const eventId = String(e.id ?? "");
      if (!eventId) return false;
      const updated = String(e.updated ?? "");
      if (!updated) return false;
      if (updated === String(e.created ?? "")) return false;

      const lastSeen = seenUpdated[eventId];
      if (lastSeen && updated <= lastSeen) return false;

      if (!matchesSearchTerm(e, matchTerm)) return false;

      seenUpdated[eventId] = updated;
      return true;
    });

    staticData.seenUpdated = seenUpdated;

    if (filtered.length === 0) return [[]];
    return [filtered.map((e) => ({ json: formatEventOutput(e) }))];
  }

  if (triggerOn === "eventCancelled") {
    const filtered = events.filter((e) => {
      if (e.status !== "cancelled") return false;
      if (String(e.updated ?? "") === String(e.created ?? "")) return false;
      return matchesSearchTerm(e, matchTerm);
    });
    if (filtered.length === 0) return [[]];
    return [filtered.map((e) => ({ json: formatEventOutput(e) }))];
  }

  if (triggerOn === "eventStarted") {
    const windowStart = new Date(lastPollTime).getTime();
    const windowEnd = now.getTime();
    const filtered = events.filter((e) => {
      if (e.status === "cancelled") return false;
      const startObj = e.start as Record<string, unknown> | undefined;
      const startDateTime = startObj?.dateTime as string | undefined;
      if (!startDateTime) return false;
      const startMs = new Date(startDateTime).getTime();
      if (startMs < windowStart || startMs > windowEnd) return false;
      return matchesSearchTerm(e, matchTerm);
    });
    if (filtered.length === 0) return [[]];
    return [filtered.map((e) => ({ json: formatEventOutput(e) }))];
  }

  if (triggerOn === "eventEnded") {
    const windowStart = new Date(lastPollTime).getTime();
    const windowEnd = now.getTime();
    const filtered = events.filter((e) => {
      if (e.status === "cancelled") return false;
      const endObj = e.end as Record<string, unknown> | undefined;
      const endDateTime = endObj?.dateTime as string | undefined;
      if (!endDateTime) return false;
      const endMs = new Date(endDateTime).getTime();
      if (endMs < windowStart || endMs > windowEnd) return false;
      return matchesSearchTerm(e, matchTerm);
    });
    if (filtered.length === 0) return [[]];
    return [filtered.map((e) => ({ json: formatEventOutput(e) }))];
  }

  return [[]];
};
