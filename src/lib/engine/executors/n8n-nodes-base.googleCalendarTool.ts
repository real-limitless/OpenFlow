import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const CAL_API = "https://www.googleapis.com/calendar/v3";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "").trim();
  }
  return String(resolved ?? "").trim();
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function encodePath(segment: string): string {
  return encodeURIComponent(segment);
}

function buildQuery(params: Record<string, string | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName =
    authentication === "serviceAccount" ? "googleApi" : "googleCalendarOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleCalendarTool: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleCalendarTool: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
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
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleCalendarTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function getOptions(node: INode): Record<string, unknown> {
  return asRecord(node.parameters.options);
}

function getUpdateFields(node: INode): Record<string, unknown> {
  return asRecord(node.parameters.updateFields);
}

function extractAttendees(
  raw: unknown,
  itemJson: Record<string, unknown>,
): Array<{ email: string }> {
  const resolved = resolveValue(raw, itemJson);
  if (!resolved) return [];
  if (Array.isArray(resolved)) {
    return resolved
      .map((a) => {
        if (typeof a === "string") return { email: a };
        if (a && typeof a === "object") {
          const email = String((a as Record<string, unknown>).email ?? "");
          return email ? { email } : null;
        }
        return null;
      })
      .filter((a): a is { email: string } => a !== null);
  }
  if (typeof resolved === "object") {
    const obj = resolved as Record<string, unknown>;
    const list = obj.attendeeValues ?? obj.values ?? obj.attendees ?? obj.email;
    if (Array.isArray(list)) return extractAttendees(list, itemJson);
    if (typeof list === "string" && list) return [{ email: list }];
  }
  if (typeof resolved === "string" && resolved) {
    return resolved.split(/[,;\s]+/).filter(Boolean).map((email) => ({ email }));
  }
  return [];
}

function buildRecurrence(
  fields: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): string[] | undefined {
  const rrule = String(resolveValue(fields.rrule, itemJson) ?? "").trim();
  if (rrule) {
    return [rrule.startsWith("RRULE:") ? rrule : `RRULE:${rrule}`];
  }
  const freq = String(resolveValue(fields.repeatFrequency, itemJson) ?? "").trim();
  if (!freq) return undefined;
  const parts = [`FREQ=${freq.toUpperCase()}`];
  const count = Number(resolveValue(fields.repeatHowManyTimes, itemJson) ?? 0);
  if (count > 0) parts.push(`COUNT=${count}`);
  const until = String(resolveValue(fields.repeatUntil, itemJson) ?? "").trim();
  if (until) {
    const d = until.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    parts.push(`UNTIL=${d.endsWith("Z") ? d : `${d}Z`}`);
  }
  return [`RRULE:${parts.join(";")}`];
}

function eventTime(
  value: unknown,
  allDay: boolean,
  itemJson: Record<string, unknown>,
): Record<string, string> {
  const raw = String(resolveValue(value, itemJson) ?? "").trim();
  if (!raw) return {};
  if (allDay) {
    const date = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
    return { date };
  }
  return { dateTime: raw };
}

async function calendarAvailability(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const calendarId = resolveLocator(node.parameters.calendar, itemJson) || "primary";
  const startTime = String(resolveValue(node.parameters.startTime, itemJson) ?? "");
  const endTime = String(resolveValue(node.parameters.endTime, itemJson) ?? "");
  if (!startTime || !endTime) {
    throw new Error("GoogleCalendarTool: startTime and endTime are required for availability");
  }
  const options = getOptions(node);
  const outputFormat = String(resolveValue(options.outputFormat, itemJson) ?? "availability");
  const timezone = String(resolveValue(options.timezone, itemJson) ?? "");

  const body: Record<string, unknown> = {
    timeMin: startTime,
    timeMax: endTime,
    items: [{ id: calendarId }],
  };
  if (timezone) body.timeZone = timezone;

  const res = await apiRequest("POST", `${CAL_API}/freeBusy`, token, body);
  const raw = asObj(res.body);

  if (outputFormat === "raw") return raw;

  const calendars = asRecord(raw.calendars);
  const cal = asRecord(calendars[calendarId] ?? Object.values(calendars)[0]);
  const busy = (Array.isArray(cal.busy) ? cal.busy : []) as Array<Record<string, unknown>>;

  if (outputFormat === "bookedSlots") {
    return { bookedSlots: busy };
  }
  return { available: busy.length === 0 };
}

async function eventCreate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const calendarId = resolveLocator(node.parameters.calendar, itemJson) || "primary";
  const options = getOptions(node);
  const allDay = resolveValue(options.allDay, itemJson) === true;
  const startTime = node.parameters.startTime;
  const endTime = node.parameters.endTime;
  if (!startTime || !endTime) {
    throw new Error("GoogleCalendarTool: startTime and endTime are required for create");
  }

  const body: Record<string, unknown> = {
    start: eventTime(startTime, allDay, itemJson),
    end: eventTime(endTime, allDay, itemJson),
  };

  const summary = String(resolveValue(options.summary, itemJson) ?? "");
  if (summary) body.summary = summary;
  const description = String(resolveValue(options.description, itemJson) ?? "");
  if (description) body.description = description;
  const location = String(resolveValue(options.location, itemJson) ?? "");
  if (location) body.location = location;
  const id = String(resolveValue(options.id, itemJson) ?? "");
  if (id) body.id = id;
  const color = String(resolveValue(options.color, itemJson) ?? "");
  if (color) body.colorId = color;
  const showMeAs = String(resolveValue(options.showMeAs, itemJson) ?? "");
  if (showMeAs) body.transparency = showMeAs;

  const attendees = extractAttendees(options.attendees, itemJson);
  if (attendees.length) body.attendees = attendees;

  if (options.guestsCanInviteOthers !== undefined) {
    body.guestsCanInviteOthers = resolveValue(options.guestsCanInviteOthers, itemJson) !== false;
  }
  if (options.guestsCanModify !== undefined) {
    body.guestsCanModify = resolveValue(options.guestsCanModify, itemJson) === true;
  }
  if (options.guestsCanSeeOtherGuests !== undefined) {
    body.guestsCanSeeOtherGuests =
      resolveValue(options.guestsCanSeeOtherGuests, itemJson) !== false;
  }

  const useDefaultReminders = node.parameters.useDefaultReminders !== false;
  body.reminders = { useDefault: useDefaultReminders };

  const recurrence = buildRecurrence(options, itemJson);
  if (recurrence) body.recurrence = recurrence;

  const conf = asRecord(resolveValue(options.conferenceData, itemJson));
  if (Object.keys(conf).length) {
    const createRequest = asRecord(conf.createRequest ?? conf);
    const requestId = String(createRequest.requestId ?? `of-${Date.now()}`);
    const confType = String(
      asRecord(createRequest.conferenceSolution).type ??
        asRecord(createRequest.conferenceSolutionKey).type ??
        createRequest.type ??
        "hangoutsMeet",
    );
    body.conferenceData = {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: confType },
      },
    };
  }

  const qs: Record<string, string | undefined> = {};
  const sendUpdates = String(resolveValue(options.sendUpdates, itemJson) ?? "");
  if (sendUpdates) qs.sendUpdates = sendUpdates;
  const maxAttendees = Number(resolveValue(options.maxAttendees, itemJson) ?? 0);
  if (maxAttendees > 0) qs.maxAttendees = String(maxAttendees);
  if (body.conferenceData) qs.conferenceDataVersion = "1";

  const url = `${CAL_API}/calendars/${encodePath(calendarId)}/events${buildQuery(qs)}`;
  const res = await apiRequest("POST", url, token, body);
  return asObj(res.body);
}

async function eventDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const calendarId = resolveLocator(node.parameters.calendar, itemJson) || "primary";
  const eventId = String(
    resolveValue(node.parameters.eventId ?? itemJson.eventId, itemJson) ?? "",
  ).trim();
  if (!eventId) throw new Error("GoogleCalendarTool: eventId is required for delete");

  const options = getOptions(node);
  const qs: Record<string, string | undefined> = {};
  const sendUpdates = String(resolveValue(options.sendUpdates, itemJson) ?? "");
  if (sendUpdates) qs.sendUpdates = sendUpdates;

  const url = `${CAL_API}/calendars/${encodePath(calendarId)}/events/${encodePath(eventId)}${buildQuery(qs)}`;
  await apiRequest("DELETE", url, token);
  return { success: true };
}

async function eventGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const calendarId = resolveLocator(node.parameters.calendar, itemJson) || "primary";
  const eventId = String(
    resolveValue(node.parameters.eventId ?? itemJson.eventId, itemJson) ?? "",
  ).trim();
  if (!eventId) throw new Error("GoogleCalendarTool: eventId is required for get");

  const options = getOptions(node);
  const qs: Record<string, string | undefined> = {};
  const maxAttendees = Number(resolveValue(options.maxAttendees, itemJson) ?? 0);
  if (maxAttendees > 0) qs.maxAttendees = String(maxAttendees);
  const timezone = String(resolveValue(options.timezone, itemJson) ?? "");
  if (timezone) qs.timeZone = timezone;

  const returnNext = resolveValue(options.returnNextRecurring, itemJson) === true;
  if (returnNext) {
    qs.timeMin = new Date().toISOString();
  }

  const url = `${CAL_API}/calendars/${encodePath(calendarId)}/events/${encodePath(eventId)}${buildQuery(qs)}`;
  const res = await apiRequest("GET", url, token);
  return asObj(res.body);
}

async function eventGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const calendarId = resolveLocator(node.parameters.calendar, itemJson) || "primary";
  const returnAll = node.parameters.returnAll !== false;
  const limit = Number(node.parameters.limit ?? 50);
  const after = String(resolveValue(node.parameters.after, itemJson) ?? "");
  const before = String(resolveValue(node.parameters.before, itemJson) ?? "");
  const options = getOptions(node);

  const baseQs: Record<string, string | undefined> = {
    singleEvents: "true",
  };
  if (after) baseQs.timeMin = after;
  if (before) baseQs.timeMax = before;

  const fields = String(resolveValue(options.fields, itemJson) ?? "");
  if (fields) baseQs.fields = fields;
  const iCalUID = String(resolveValue(options.iCalUID, itemJson) ?? "");
  if (iCalUID) baseQs.iCalUID = iCalUID;
  const maxAttendees = Number(resolveValue(options.maxAttendees, itemJson) ?? 0);
  if (maxAttendees > 0) baseQs.maxAttendees = String(maxAttendees);
  const orderBy = String(resolveValue(options.orderBy, itemJson) ?? "");
  if (orderBy) baseQs.orderBy = orderBy;
  const query = String(resolveValue(options.query, itemJson) ?? "");
  if (query) baseQs.q = query;
  if (resolveValue(options.showDeleted, itemJson) === true) baseQs.showDeleted = "true";
  if (resolveValue(options.showHiddenInvitations, itemJson) === true) {
    baseQs.showHiddenInvitations = "true";
  }
  const timezone = String(resolveValue(options.timezone, itemJson) ?? "");
  if (timezone) baseQs.timeZone = timezone;
  const updatedMin = String(resolveValue(options.updatedMin, itemJson) ?? "");
  if (updatedMin) baseQs.updatedMin = updatedMin;

  const handling = String(resolveValue(options.recurringEventHandling, itemJson) ?? "");
  if (handling === "firstOccurrence" || handling === "nextOccurrence") {
    baseQs.singleEvents = "true";
  } else if (handling === "allOccurrences") {
    baseQs.singleEvents = "true";
  }

  const results: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  const pageSize = returnAll ? 250 : Math.min(Math.max(limit, 1), 250);

  do {
    const qs = {
      ...baseQs,
      maxResults: String(returnAll ? pageSize : Math.min(limit - results.length, pageSize)),
      pageToken,
    };
    const url = `${CAL_API}/calendars/${encodePath(calendarId)}/events${buildQuery(qs)}`;
    const res = await apiRequest("GET", url, token);
    const body = asObj(res.body);
    const items = (Array.isArray(body.items) ? body.items : []) as Record<string, unknown>[];
    for (const ev of items) {
      results.push(ev);
      if (!returnAll && results.length >= limit) break;
    }
    pageToken = returnAll ? String(body.nextPageToken ?? "") || undefined : undefined;
    if (!returnAll && results.length >= limit) break;
  } while (pageToken);

  return results;
}

async function eventUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const calendarId = resolveLocator(node.parameters.calendar, itemJson) || "primary";
  const eventId = String(
    resolveValue(node.parameters.eventId ?? itemJson.eventId, itemJson) ?? "",
  ).trim();
  if (!eventId) throw new Error("GoogleCalendarTool: eventId is required for update");

  const fields = getUpdateFields(node);
  const allDay = resolveValue(fields.allDay, itemJson) === true;
  const body: Record<string, unknown> = {};

  if (fields.start !== undefined && fields.start !== "") {
    body.start = eventTime(fields.start, allDay, itemJson);
  }
  if (fields.end !== undefined && fields.end !== "") {
    body.end = eventTime(fields.end, allDay, itemJson);
  }
  if (fields.summary !== undefined) {
    body.summary = String(resolveValue(fields.summary, itemJson) ?? "");
  }
  if (fields.description !== undefined) {
    body.description = String(resolveValue(fields.description, itemJson) ?? "");
  }
  if (fields.location !== undefined) {
    body.location = String(resolveValue(fields.location, itemJson) ?? "");
  }
  if (fields.id !== undefined && fields.id !== "") {
    body.id = String(resolveValue(fields.id, itemJson) ?? "");
  }
  if (fields.color !== undefined && fields.color !== "") {
    body.colorId = String(resolveValue(fields.color, itemJson) ?? "");
  }
  if (fields.showMeAs !== undefined && fields.showMeAs !== "") {
    body.transparency = String(resolveValue(fields.showMeAs, itemJson) ?? "");
  }
  if (fields.visibility !== undefined && fields.visibility !== "") {
    body.visibility = String(resolveValue(fields.visibility, itemJson) ?? "");
  }
  if (fields.attendees !== undefined) {
    const attendees = extractAttendees(fields.attendees, itemJson);
    if (attendees.length) body.attendees = attendees;
  }
  if (fields.guestsCanInviteOthers !== undefined) {
    body.guestsCanInviteOthers = resolveValue(fields.guestsCanInviteOthers, itemJson) !== false;
  }
  if (fields.guestsCanModify !== undefined) {
    body.guestsCanModify = resolveValue(fields.guestsCanModify, itemJson) === true;
  }
  if (fields.guestsCanSeeOtherGuests !== undefined) {
    body.guestsCanSeeOtherGuests =
      resolveValue(fields.guestsCanSeeOtherGuests, itemJson) !== false;
  }

  const useDefaultReminders = node.parameters.useDefaultReminders !== false;
  body.reminders = { useDefault: useDefaultReminders };

  const recurrence = buildRecurrence(fields, itemJson);
  if (recurrence) body.recurrence = recurrence;

  const qs: Record<string, string | undefined> = {};
  const sendUpdates = String(resolveValue(fields.sendUpdates, itemJson) ?? "");
  if (sendUpdates) qs.sendUpdates = sendUpdates;
  const maxAttendees = Number(resolveValue(fields.maxAttendees, itemJson) ?? 0);
  if (maxAttendees > 0) qs.maxAttendees = String(maxAttendees);

  const url = `${CAL_API}/calendars/${encodePath(calendarId)}/events/${encodePath(eventId)}${buildQuery(qs)}`;
  const res = await apiRequest("PATCH", url, token, body);
  return asObj(res.body);
}

export const googleCalendarToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(
    node.parameters.resource ?? ctx.getParam("resource", "event") ?? "event",
  );
  const operation = String(
    node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create",
  );
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const token = await getAccessToken(ctx, node);
      if (resource === "calendar") {
        if (operation !== "availability") {
          throw new Error(`GoogleCalendarTool: unsupported calendar operation "${operation}"`);
        }
        const json = await calendarAvailability(node, itemJson, token);
        out.push({ json, pairedItem });
      } else if (resource === "event") {
        if (operation === "create") {
          out.push({ json: await eventCreate(node, itemJson, token), pairedItem });
        } else if (operation === "delete") {
          out.push({ json: await eventDelete(node, itemJson, token), pairedItem });
        } else if (operation === "get") {
          out.push({ json: await eventGet(node, itemJson, token), pairedItem });
        } else if (operation === "getAll") {
          const events = await eventGetAll(node, itemJson, token);
          for (const ev of events) {
            out.push({ json: ev, pairedItem });
          }
        } else if (operation === "update") {
          out.push({ json: await eventUpdate(node, itemJson, token), pairedItem });
        } else {
          throw new Error(`GoogleCalendarTool: unsupported event operation "${operation}"`);
        }
      } else {
        throw new Error(`GoogleCalendarTool: unsupported resource "${resource}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};