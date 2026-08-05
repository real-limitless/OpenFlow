import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.getgo.com/G2W/rest/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", "return " + raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1"));
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function resolveString(raw: unknown, itemJson: Record<string, unknown>): string {
  const v = resolveValue(raw, itemJson);
  return v == null ? "" : String(v);
}

function parseJsonArray(raw: unknown): Record<string, unknown>[] {
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const goToWebinarExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "webinar");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as unknown as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("goToWebinarOAuth2Api");
  if (!cred) return {};
  const data = cred as Record<string, unknown>;
  const token = String(data.accessToken ?? ((data.oauthTokenData as Record<string, unknown> | undefined)?.access_token as string ?? ""));
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function apiRequest(
  ctx: ExecutionContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const headers = await getAuthHeaders(ctx);
  headers["Content-Type"] = "application/json";
  headers["Accept"] = "application/json";

  const url = `${API_BASE}${path}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

  if (!res.ok) {
    const err = new Error(`GoToWebinar API ${res.status}: ${text}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  return parsed;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  switch (resource) {
    case "webinar":
      return runWebinar(ctx, node, operation, itemJson, item);
    case "registrant":
      return runRegistrant(ctx, node, operation, itemJson, item);
    case "attendee":
      return runAttendee(ctx, node, operation, itemJson, item);
    case "session":
      return runSession(ctx, node, operation, itemJson, item);
    case "coOrganizer":
      return runCoOrganizer(ctx, node, operation, itemJson, item);
    case "panelist":
      return runPanelist(ctx, node, operation, itemJson, item);
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}

function getParamRaw(node: INode, name: string): unknown {
  return node.parameters?.[name];
}

function getParam(node: INode, name: string, itemJson: Record<string, unknown>): string {
  return resolveString(getParamRaw(node, name), itemJson);
}

function parseTimes(raw: unknown): Array<{ startTime: string; endTime: string }> {
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  if (Array.isArray(raw)) return raw as Array<{ startTime: string; endTime: string }>;
  return [];
}

async function runWebinar(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResultList> {
  switch (operation) {
    case "create": {
      const body: Record<string, unknown> = {
        subject: getParam(node, "subject", itemJson),
        description: getParam(node, "description", itemJson),
        timeZone: getParam(node, "timeZone", itemJson),
        type: getParam(node, "type", itemJson) || "single_session",
      };
      const times = parseTimes(getParamRaw(node, "times"));
      if (times.length > 0) body.times = times;
      const locale = getParam(node, "locale", itemJson);
      if (locale) body.locale = locale;
      const experienceType = getParam(node, "experienceType", itemJson);
      if (experienceType) body.experienceType = experienceType;
      const isPasswordProtected = getParamRaw(node, "isPasswordProtected");
      if (isPasswordProtected !== undefined) body.isPasswordProtected = isPasswordProtected;
      const isOndemand = getParamRaw(node, "isOndemand");
      if (isOndemand !== undefined) body.isOndemand = isOndemand;
      if (!body.subject) throw new Error("subject is required for webinar create");

      const result = await apiRequest(ctx, "POST", "/organizers/self/webinars", body);
      return { json: result as Record<string, unknown> };
    }

    case "get": {
      const webinarKey = getParam(node, "webinarKey", itemJson);
      if (!webinarKey) throw new Error("webinarKey is required for webinar get");
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}`);
      return { json: result as Record<string, unknown> };
    }

    case "getAll": {
      const queryParts: string[] = [];
      const fromTime = getParam(node, "fromTime", itemJson);
      const toTime = getParam(node, "toTime", itemJson);
      if (fromTime) queryParts.push(`fromTime=${encodeURIComponent(fromTime)}`);
      if (toTime) queryParts.push(`toTime=${encodeURIComponent(toTime)}`);

      const returnAll = getParamRaw(node, "returnAll");
      const limitRaw = getParamRaw(node, "limit");
      const limit = typeof limitRaw === "number" ? limitRaw : 100;

      let page = 0;
      const pageSize = returnAll ? 100 : Math.min(limit, 100);
      const allItems: Record<string, unknown>[] = [];

      while (true) {
        const qs = [...queryParts, `page=${page}`, `size=${pageSize}`].join("&");
        const result = await apiRequest(ctx, "GET", `/organizers/self/webinars?${qs}`);
        const arr = Array.isArray(result) ? result : [];
        allItems.push(...arr);
        if (!returnAll && allItems.length >= limit) {
          return allItems.slice(0, limit).map((j) => ({ json: j }));
        }
        if (arr.length < pageSize) break;
        page++;
      }

      return allItems.map((j) => ({ json: j }));
    }

    case "update": {
      const webinarKey = getParam(node, "webinarKey", itemJson);
      if (!webinarKey) throw new Error("webinarKey is required for webinar update");
      const body: Record<string, unknown> = {};
      const subject = getParam(node, "subject", itemJson);
      if (subject) body.subject = subject;
      const description = getParam(node, "description", itemJson);
      if (description) body.description = description;
      const times = parseTimes(getParamRaw(node, "times"));
      if (times.length > 0) body.times = times;
      const timeZone = getParam(node, "timeZone", itemJson);
      if (timeZone) body.timeZone = timeZone;
      await apiRequest(ctx, "PUT", `/organizers/self/webinars/${webinarKey}`, body);
      return { json: { webinarKey } };
    }

    default:
      throw new Error(`Unknown webinar operation: ${operation}`);
  }
}

async function runRegistrant(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResultList> {
  const webinarKey = getParam(node, "webinarKey", itemJson);
  if (!webinarKey) throw new Error("webinarKey is required for registrant operations");

  switch (operation) {
    case "create": {
      const body: Record<string, unknown> = {
        email: getParam(node, "email", itemJson),
        firstName: getParam(node, "firstName", itemJson),
        lastName: getParam(node, "lastName", itemJson),
      };
      if (!body.email) throw new Error("email is required for registrant create");
      const result = await apiRequest(ctx, "POST", `/organizers/self/webinars/${webinarKey}/registrants`, body);
      return { json: result as Record<string, unknown> };
    }

    case "get": {
      const registrantKey = getParam(node, "registrantKey", itemJson);
      if (!registrantKey) throw new Error("registrantKey is required for registrant get");
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/registrants/${registrantKey}`);
      return { json: result as Record<string, unknown> };
    }

    case "getAll": {
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/registrants`);
      const arr = Array.isArray(result) ? result : [];
      return arr.map((j: Record<string, unknown>) => ({ json: j }));
    }

    case "delete": {
      const registrantKey = getParam(node, "registrantKey", itemJson);
      if (!registrantKey) throw new Error("registrantKey is required for registrant delete");
      await apiRequest(ctx, "DELETE", `/organizers/self/webinars/${webinarKey}/registrants/${registrantKey}`);
      return { json: { success: true } };
    }

    default:
      throw new Error(`Unknown registrant operation: ${operation}`);
  }
}

async function runAttendee(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResultList> {
  const webinarKey = getParam(node, "webinarKey", itemJson);
  if (!webinarKey) throw new Error("webinarKey is required for attendee operations");
  const sessionKey = getParam(node, "sessionKey", itemJson);

  switch (operation) {
    case "get": {
      if (!sessionKey) throw new Error("sessionKey is required for attendee get");
      const registrantKey = getParam(node, "registrantKey", itemJson);
      if (!registrantKey) throw new Error("registrantKey is required for attendee get");
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/sessions/${sessionKey}/attendees/${registrantKey}`);
      return { json: result as Record<string, unknown> };
    }

    case "getAll": {
      const qs = sessionKey ? `/sessions/${sessionKey}/attendees` : "/attendees";
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}${qs}`);
      const arr = Array.isArray(result) ? result : [];
      return arr.map((j: Record<string, unknown>) => ({ json: j }));
    }

    case "getDetails": {
      if (!sessionKey) throw new Error("sessionKey is required for attendee getDetails");
      const registrantKey = getParam(node, "registrantKey", itemJson);
      if (!registrantKey) throw new Error("registrantKey is required for attendee getDetails");
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/sessions/${sessionKey}/attendees/${registrantKey}/details`);
      return { json: result as Record<string, unknown> };
    }

    default:
      throw new Error(`Unknown attendee operation: ${operation}`);
  }
}

async function runSession(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResultList> {
  const webinarKey = getParam(node, "webinarKey", itemJson);
  if (!webinarKey) throw new Error("webinarKey is required for session operations");
  const sessionKey = getParam(node, "sessionKey", itemJson);

  switch (operation) {
    case "get": {
      if (!sessionKey) throw new Error("sessionKey is required for session get");
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/sessions/${sessionKey}`);
      return { json: result as Record<string, unknown> };
    }

    case "getAll": {
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/sessions`);
      const arr = Array.isArray(result) ? result : [];
      return arr.map((j: Record<string, unknown>) => ({ json: j }));
    }

    case "getDetails": {
      if (!sessionKey) throw new Error("sessionKey is required for session getDetails");
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/sessions/${sessionKey}`);
      return { json: result as Record<string, unknown> };
    }

    default:
      throw new Error(`Unknown session operation: ${operation}`);
  }
}

async function runCoOrganizer(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResultList> {
  const webinarKey = getParam(node, "webinarKey", itemJson);
  if (!webinarKey) throw new Error("webinarKey is required for co-organizer operations");

  switch (operation) {
    case "create": {
      const body: Record<string, unknown> = {
        email: getParam(node, "email", itemJson),
        givenName: getParam(node, "givenName", itemJson),
        familyName: getParam(node, "familyName", itemJson),
      };
      await apiRequest(ctx, "POST", `/organizers/self/webinars/${webinarKey}/coOrganizers`, body);
      return { json: { success: true } };
    }

    case "delete": {
      const organizerKey = getParam(node, "organizerKey", itemJson);
      if (!organizerKey) throw new Error("organizerKey is required for co-organizer delete");
      await apiRequest(ctx, "DELETE", `/organizers/self/webinars/${webinarKey}/coOrganizers/${organizerKey}`);
      return { json: { success: true } };
    }

    case "getAll": {
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/coOrganizers`);
      const arr = Array.isArray(result) ? result : [];
      return arr.map((j: Record<string, unknown>) => ({ json: j }));
    }

    case "reInvite": {
      const organizerKey = getParam(node, "organizerKey", itemJson);
      if (!organizerKey) throw new Error("organizerKey is required for co-organizer re-invite");
      await apiRequest(ctx, "PUT", `/organizers/self/webinars/${webinarKey}/coOrganizers/${organizerKey}/reinvite`);
      return { json: { success: true } };
    }

    default:
      throw new Error(`Unknown co-organizer operation: ${operation}`);
  }
}

async function runPanelist(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResultList> {
  const webinarKey = getParam(node, "webinarKey", itemJson);
  if (!webinarKey) throw new Error("webinarKey is required for panelist operations");

  switch (operation) {
    case "create": {
      const body: Record<string, unknown> = {
        email: getParam(node, "email", itemJson),
        givenName: getParam(node, "givenName", itemJson),
        familyName: getParam(node, "familyName", itemJson),
      };
      await apiRequest(ctx, "POST", `/organizers/self/webinars/${webinarKey}/panelists`, body);
      return { json: { success: true } };
    }

    case "delete": {
      const panelistKey = getParam(node, "panelistKey", itemJson);
      if (!panelistKey) throw new Error("panelistKey is required for panelist delete");
      await apiRequest(ctx, "DELETE", `/organizers/self/webinars/${webinarKey}/panelists/${panelistKey}`);
      return { json: { success: true } };
    }

    case "getAll": {
      const result = await apiRequest(ctx, "GET", `/organizers/self/webinars/${webinarKey}/panelists`);
      const arr = Array.isArray(result) ? result : [];
      return arr.map((j: Record<string, unknown>) => ({ json: j }));
    }

    case "reInvite": {
      const panelistKey = getParam(node, "panelistKey", itemJson);
      if (!panelistKey) throw new Error("panelistKey is required for panelist re-invite");
      await apiRequest(ctx, "PUT", `/organizers/self/webinars/${webinarKey}/panelists/${panelistKey}/reinvite`);
      return { json: { success: true } };
    }

    default:
      throw new Error(`Unknown panelist operation: ${operation}`);
  }
}
