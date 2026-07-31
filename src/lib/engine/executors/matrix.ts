import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function(
        "$json",
        `"use strict"; return (${raw.replace(/^\=/, "")})`,
      );
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

interface OpResult {
  json: Record<string, unknown>;
}

async function matrixRequest(
  homeserverUrl: string,
  accessToken: string,
  method: string,
  path: string,
  body?: Record<string, unknown> | string,
): Promise<Record<string, unknown>> {
  const baseUrl = homeserverUrl.replace(/\/+$/, "");
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.headers = {
        ...init.headers,
        "Content-Type": "application/json; charset=utf-8",
      };
      init.body = typeof body === "string" ? body : JSON.stringify(body);
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
      const errcode = obj.errcode ? String(obj.errcode) : "";
      const error = obj.error ? String(obj.error) : "";
      const errMsg = errcode
        ? `Matrix error ${errcode}: ${error}`
        : `Matrix request failed with status code ${response.status}`;
      throw new Error(errMsg);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith("Matrix") || err.message.startsWith("M_"))) {
      throw err;
    }
    if (err instanceof Error) {
      throw new Error(`Matrix request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getCreds(ctx: ExecutionContext): Promise<{ homeserverUrl: string; accessToken: string }> {
  const cred = await ctx.getCredential("matrixApi");
  if (!cred) {
    throw new Error("Matrix: matrixApi credential is required");
  }
  const homeserverUrl = String(cred.homeserverUrl ?? "https://matrix.org");
  const accessToken = String(cred.accessToken ?? "");
  if (!accessToken) {
    throw new Error("Matrix: accessToken is required in credential");
  }
  return { homeserverUrl, accessToken };
}

export const matrixExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "message");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const { homeserverUrl, accessToken } = await getCreds(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(homeserverUrl, accessToken, node, resource, operation, itemJson);
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

async function runOperation(
  homeserverUrl: string,
  accessToken: string,
  node: { parameters: Record<string, unknown> },
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  switch (resource) {
    case "account": return runAccountOperation(homeserverUrl, accessToken, operation, itemJson);
    case "event": return runEventOperation(homeserverUrl, accessToken, node, operation, itemJson);
    case "media": return runMediaOperation(homeserverUrl, accessToken, node, operation, itemJson);
    case "message": return runMessageOperation(homeserverUrl, accessToken, node, operation, itemJson);
    case "room": return runRoomOperation(homeserverUrl, accessToken, node, operation, itemJson);
    case "roomMember": return runRoomMemberOperation(homeserverUrl, accessToken, node, operation, itemJson);
    default: throw new Error(`Matrix: unsupported resource "${resource}"`);
  }
}

// ---------------------------------------------------------------------------
// account
// ---------------------------------------------------------------------------

async function runAccountOperation(
  homeserverUrl: string,
  accessToken: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation === "me") {
    const res = await matrixRequest(homeserverUrl, accessToken, "GET", "/_matrix/client/v3/account/whoami");
    return { json: res };
  }
  throw new Error(`Matrix: unsupported account operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// event
// ---------------------------------------------------------------------------

async function runEventOperation(
  homeserverUrl: string,
  accessToken: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation === "get") {
    const roomId = String(resolveValue(node.parameters.roomId, itemJson) ?? "");
    const eventId = String(resolveValue(node.parameters.eventId, itemJson) ?? "");
    if (!roomId) throw new Error("Matrix: roomId is required for event:get");
    if (!eventId) throw new Error("Matrix: eventId is required for event:get");
    const res = await matrixRequest(homeserverUrl, accessToken, "GET", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`);
    return { json: res as Record<string, unknown> };
  }
  throw new Error(`Matrix: unsupported event operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------

async function runMediaOperation(
  homeserverUrl: string,
  accessToken: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation === "upload") {
    const res = await matrixRequest(homeserverUrl, accessToken, "POST", "/_matrix/media/v3/upload");
    return { json: res as Record<string, unknown> };
  }
  throw new Error(`Matrix: unsupported media operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// message
// ---------------------------------------------------------------------------

async function runMessageOperation(
  homeserverUrl: string,
  accessToken: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  const roomId = String(resolveValue(node.parameters.roomId, itemJson) ?? "");
  if (!roomId) throw new Error("Matrix: roomId is required for message operations");

  if (operation === "create") {
    const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
    const messageType = String(node.parameters.messageType ?? "m.text");
    const messageFormat = String(node.parameters.messageFormat ?? "plain");
    const fallbackText = String(resolveValue(node.parameters.fallbackText, itemJson) ?? "");

    const content: Record<string, unknown> = { body: text || " ", msgtype: messageType };
    if (messageFormat === "org.matrix.custom.html") {
      content.format = "org.matrix.custom.html";
      content.formatted_body = text;
      if (fallbackText) content.body = fallbackText;
    }

    const txnId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const res = await matrixRequest(
      homeserverUrl,
      accessToken,
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      content,
    );
    return { json: res as Record<string, unknown> };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 100);
    const dir = "f";
    const actualLimit = returnAll ? 500 : Math.min(limit, 500);
    const params = `?dir=${dir}&limit=${actualLimit}`;
    const otherOptions = node.parameters.otherOptions as Record<string, unknown> | undefined;
    let filter = "";
    if (otherOptions?.filter) {
      filter = `&filter=${encodeURIComponent(String(otherOptions.filter))}`;
    }
    const res = await matrixRequest(
      homeserverUrl,
      accessToken,
      "GET",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages${params}${filter}`,
    );
    const chunk = Array.isArray((res as Record<string, unknown>).chunk) ? (res as Record<string, unknown>).chunk as Array<Record<string, unknown>> : [];
    return chunk.map((msg) => ({ json: msg }));
  }

  throw new Error(`Matrix: unsupported message operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// room
// ---------------------------------------------------------------------------

async function runRoomOperation(
  homeserverUrl: string,
  accessToken: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation === "create") {
    const roomName = String(resolveValue(node.parameters.roomName, itemJson) ?? "");
    const preset = String(node.parameters.preset ?? "public_chat");
    const roomAlias = String(resolveValue(node.parameters.roomAlias, itemJson) ?? "");
    if (!roomName) throw new Error("Matrix: roomName is required for room:create");
    const body: Record<string, unknown> = { name: roomName, preset };
    if (roomAlias) body.room_alias_name = roomAlias;
    const res = await matrixRequest(homeserverUrl, accessToken, "POST", "/_matrix/client/v3/createRoom", body);
    return { json: res };
  }

  if (operation === "join") {
    const roomIdOrAlias = String(resolveValue(node.parameters.roomIdOrAlias, itemJson) ?? "");
    if (!roomIdOrAlias) throw new Error("Matrix: roomIdOrAlias is required for room:join");
    const res = await matrixRequest(homeserverUrl, accessToken, "POST", `/_matrix/client/v3/join/${encodeURIComponent(roomIdOrAlias)}`);
    return { json: res };
  }

  if (operation === "invite") {
    const roomId = String(resolveValue(node.parameters.roomId, itemJson) ?? "");
    const userId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!roomId) throw new Error("Matrix: roomId is required for room:invite");
    if (!userId) throw new Error("Matrix: userId is required for room:invite");
    await matrixRequest(homeserverUrl, accessToken, "POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, { user_id: userId });
    return { json: {} };
  }

  if (operation === "kick") {
    const roomId = String(resolveValue(node.parameters.roomId, itemJson) ?? "");
    const userId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    const reason = String(resolveValue(node.parameters.reason, itemJson) ?? "");
    if (!roomId) throw new Error("Matrix: roomId is required for room:kick");
    if (!userId) throw new Error("Matrix: userId is required for room:kick");
    const body: Record<string, unknown> = { user_id: userId };
    if (reason) body.reason = reason;
    await matrixRequest(homeserverUrl, accessToken, "POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`, body);
    return { json: {} };
  }

  if (operation === "leave") {
    const roomId = String(resolveValue(node.parameters.roomId, itemJson) ?? "");
    if (!roomId) throw new Error("Matrix: roomId is required for room:leave");
    await matrixRequest(homeserverUrl, accessToken, "POST", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`);
    return { json: {} };
  }

  throw new Error(`Matrix: unsupported room operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// roomMember
// ---------------------------------------------------------------------------

async function runRoomMemberOperation(
  homeserverUrl: string,
  accessToken: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult[]> {
  if (operation === "getAll") {
    const roomId = String(resolveValue(node.parameters.roomId, itemJson) ?? "");
    if (!roomId) throw new Error("Matrix: roomId is required for roomMember:getAll");
    const filters = node.parameters.filters as Record<string, unknown> | undefined;
    let params = "";
    if (filters) {
      const membership = filters.membership ? String(filters.membership) : "";
      const notMembership = filters.notMembership ? String(filters.notMembership) : "";
      if (membership) params += `&membership=${encodeURIComponent(membership)}`;
      if (notMembership) params += `&not_membership=${encodeURIComponent(notMembership)}`;
    }
    const res = await matrixRequest(
      homeserverUrl,
      accessToken,
      "GET",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members?${params.slice(1)}`,
    );
    const chunk = Array.isArray((res as Record<string, unknown>).chunk) ? (res as Record<string, unknown>).chunk as Array<Record<string, unknown>> : [];
    return chunk.map((member) => ({ json: member }));
  }

  throw new Error(`Matrix: unsupported roomMember operation "${operation}"`);
}