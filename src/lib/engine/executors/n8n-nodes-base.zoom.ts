import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.zoom.us/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

const ZOOM_TYPE_MAP: Record<string, number> = {
  instant: 1,
  scheduled: 2,
  recurringNoFixedTime: 3,
  recurringFixedTime: 8,
};

const WEBINAR_TYPE_MAP: Record<string, number> = {
  webinar: 5,
  recurringNoFixedTime: 6,
  recurringFixedTime: 9,
};

export const zoomExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "meeting");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("zoomApi");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("Zoom: zoomApi credential is not configured");
  }
  return accessToken;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  const token = await getToken(ctx);

  if (resource === "meeting") {
    return runMeetingOperation(token, node, operation, itemJson);
  }
  if (resource === "meetingRegistrant") {
    return runMeetingRegistrantOperation(token, node, operation, itemJson);
  }
  if (resource === "webinar") {
    return runWebinarOperation(token, node, operation, itemJson);
  }
  throw new Error(`Zoom: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Meeting
// ---------------------------------------------------------------------------

async function runMeetingOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  if (operation === "create") {
    return createMeeting(token, node, itemJson);
  }
  if (operation === "get") {
    const meetingId = String(resolveValue(node.parameters.meetingId, itemJson) ?? "");
    if (!meetingId) throw new Error("Zoom: meetingId is required for get");
    const res = await zoomRequest(token, "GET", `meetings/${meetingId}`);
    return { json: res };
  }
  if (operation === "getAll") {
    return getAllMeetings(token, node, itemJson);
  }
  if (operation === "update") {
    const meetingId = String(resolveValue(node.parameters.meetingId, itemJson) ?? "");
    if (!meetingId) throw new Error("Zoom: meetingId is required for update");
    const body = buildMeetingBody(node, itemJson);
    await zoomRequest(token, "PATCH", `meetings/${meetingId}`, body);
    return { json: itemJson };
  }
  if (operation === "delete") {
    const meetingId = String(resolveValue(node.parameters.meetingId, itemJson) ?? "");
    if (!meetingId) throw new Error("Zoom: meetingId is required for delete");
    await zoomRequest(token, "DELETE", `meetings/${meetingId}`);
    return { json: { ...itemJson } };
  }
  throw new Error(`Zoom: unsupported meeting operation "${operation}"`);
}

function buildMeetingBody(
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const topic = resolveValue(node.parameters.topic, itemJson);
  if (topic) body.topic = String(topic);

  const rawType = String(node.parameters.type ?? "scheduled");
  body.type = ZOOM_TYPE_MAP[rawType] ?? 2;

  const agenda = resolveValue(node.parameters.agenda, itemJson);
  if (agenda) body.agenda = String(agenda);

  const duration = resolveValue(node.parameters.duration, itemJson);
  if (duration !== undefined && duration !== null && duration !== "") {
    body.duration = Number(duration);
  }

  const startTime = resolveValue(node.parameters.startTime, itemJson);
  if (startTime) body.start_time = String(startTime);

  const timezone = resolveValue(node.parameters.timezone, itemJson);
  if (timezone) body.timezone = String(timezone);

  const password = resolveValue(node.parameters.password, itemJson);
  if (password) body.password = String(password);

  const settings = resolveValue(node.parameters.settings, itemJson);
  if (settings && typeof settings === "object") {
    body.settings = settings;
  }

  return body;
}

async function createMeeting(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const body = buildMeetingBody(node, itemJson);
  const res = await zoomRequest(token, "POST", "users/me/meetings", body);
  return { json: res };
}

async function getAllMeetings(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 30);
  const items = await zoomRequestAll(token, "users/me/meetings", "meetings", returnAll, limit, {
    page_size: String(Math.min(limit, 300)),
  });
  return items.map((i) => ({ json: i }));
}

// ---------------------------------------------------------------------------
// Meeting Registrant
// ---------------------------------------------------------------------------

async function runMeetingRegistrantOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  const meetingId = String(resolveValue(node.parameters.meetingId, itemJson) ?? "");
  if (!meetingId) throw new Error("Zoom: meetingId is required");

  if (operation === "create") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("Zoom: email is required for registrant create");
    const firstName = String(resolveValue(node.parameters.firstName, itemJson) ?? "");
    if (!firstName) throw new Error("Zoom: firstName is required for registrant create");
    const lastName = String(resolveValue(node.parameters.lastName, itemJson) ?? "");
    const body: Record<string, unknown> = { email, first_name: firstName };
    if (lastName) body.last_name = lastName;
    const res = await zoomRequest(token, "POST", `meetings/${meetingId}/registrants`, body);
    return { json: res };
  }
  if (operation === "get") {
    const registrantId = String(resolveValue(node.parameters.registrantId, itemJson) ?? "");
    if (!registrantId) throw new Error("Zoom: registrantId is required for get");
    const res = await zoomRequest(token, "GET", `meetings/${meetingId}/registrants/${registrantId}`);
    return { json: res };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 30);
    const items = await zoomRequestAll(
      token,
      `meetings/${meetingId}/registrants`,
      "registrants",
      returnAll,
      limit,
      { page_size: String(Math.min(limit, 300)) },
    );
    return items.map((i) => ({ json: i }));
  }
  if (operation === "update") {
    const registrantId = String(resolveValue(node.parameters.registrantId, itemJson) ?? "");
    if (!registrantId) throw new Error("Zoom: registrantId is required for update");
    const body: Record<string, unknown> = {};
    const email = resolveValue(node.parameters.email, itemJson);
    if (email) body.email = String(email);
    const firstName = resolveValue(node.parameters.firstName, itemJson);
    if (firstName) body.first_name = String(firstName);
    const lastName = resolveValue(node.parameters.lastName, itemJson);
    if (lastName) body.last_name = String(lastName);
    await zoomRequest(token, "PATCH", `meetings/${meetingId}/registrants/${registrantId}`, body);
    return { json: itemJson };
  }
  if (operation === "delete") {
    const registrantId = String(resolveValue(node.parameters.registrantId, itemJson) ?? "");
    if (!registrantId) throw new Error("Zoom: registrantId is required for delete");
    await zoomRequest(token, "DELETE", `meetings/${meetingId}/registrants/${registrantId}`);
    return { json: { ...itemJson } };
  }
  throw new Error(`Zoom: unsupported meetingRegistrant operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Webinar
// ---------------------------------------------------------------------------

function buildWebinarBody(
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const topic = resolveValue(node.parameters.topic, itemJson);
  if (topic) body.topic = String(topic);

  const rawType = String(node.parameters.type ?? "webinar");
  body.type = WEBINAR_TYPE_MAP[rawType] ?? 5;

  const agenda = resolveValue(node.parameters.agenda, itemJson);
  if (agenda) body.agenda = String(agenda);

  const duration = resolveValue(node.parameters.duration, itemJson);
  if (duration !== undefined && duration !== null && duration !== "") {
    body.duration = Number(duration);
  }

  const startTime = resolveValue(node.parameters.startTime, itemJson);
  if (startTime) body.start_time = String(startTime);

  const timezone = resolveValue(node.parameters.timezone, itemJson);
  if (timezone) body.timezone = String(timezone);

  const password = resolveValue(node.parameters.password, itemJson);
  if (password) body.password = String(password);

  const settings = resolveValue(node.parameters.settings, itemJson);
  if (settings && typeof settings === "object") {
    body.settings = settings;
  }

  return body;
}

async function runWebinarOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  if (operation === "create") {
    const body = buildWebinarBody(node, itemJson);
    const res = await zoomRequest(token, "POST", "users/me/webinars", body);
    return { json: res };
  }
  if (operation === "get") {
    const webinarId = String(resolveValue(node.parameters.webinarId, itemJson) ?? "");
    if (!webinarId) throw new Error("Zoom: webinarId is required for get");
    const res = await zoomRequest(token, "GET", `webinars/${webinarId}`);
    return { json: res };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 30);
    const items = await zoomRequestAll(token, "users/me/webinars", "webinars", returnAll, limit, {
      page_size: String(Math.min(limit, 300)),
    });
    return items.map((i) => ({ json: i }));
  }
  if (operation === "update") {
    const webinarId = String(resolveValue(node.parameters.webinarId, itemJson) ?? "");
    if (!webinarId) throw new Error("Zoom: webinarId is required for update");
    const body = buildWebinarBody(node, itemJson);
    await zoomRequest(token, "PATCH", `webinars/${webinarId}`, body);
    return { json: itemJson };
  }
  if (operation === "delete") {
    const webinarId = String(resolveValue(node.parameters.webinarId, itemJson) ?? "");
    if (!webinarId) throw new Error("Zoom: webinarId is required for delete");
    await zoomRequest(token, "DELETE", `webinars/${webinarId}`);
    return { json: { ...itemJson } };
  }
  throw new Error(`Zoom: unsupported webinar operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function zoomRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${API_BASE}/${endpoint}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}/${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(obj.message ?? `Request failed with status code ${response.status}`);
      throw new Error(`Zoom API error: ${errMsg}`);
    }
    return asObj(parsed);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Zoom")) throw err;
    throw new Error(`Zoom request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function zoomRequestAll(
  token: string,
  endpoint: string,
  dataKey: string,
  returnAll: boolean,
  limit: number,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let nextPageToken = "";
  const pageSize = returnAll ? 300 : Math.min(limit, 300);

  do {
    const pageParams: Record<string, string> = { ...params, page_size: String(pageSize) };
    if (nextPageToken) pageParams.next_page_token = nextPageToken;
    const res = await zoomRequest(token, "GET", endpoint, undefined, pageParams);
    const items = (res[dataKey] ?? []) as Record<string, unknown>[];
    results.push(...items);
    nextPageToken = String(res.next_page_token ?? "");
    if (!returnAll) break;
  } while (nextPageToken && nextPageToken !== "");

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}
