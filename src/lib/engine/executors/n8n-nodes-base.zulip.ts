import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

interface ZulipCredential {
  url: string;
  email: string;
  apiKey: string;
}

async function getCreds(ctx: ExecutionContext): Promise<ZulipCredential> {
  const cred = await ctx.getCredential("zulipApi") as ZulipCredential | null;
  if (!cred || !cred.url || !cred.email || !cred.apiKey) {
    throw new Error("Zulip: valid zulipApi credential is required");
  }
  return cred;
}

function baseUrl(cred: ZulipCredential): string {
  return cred.url.replace(/\/+$/, "");
}

async function zulipRequest(
  base: string,
  email: string,
  apiKey: string,
  method: string,
  endpoint: string,
  body?: FormData | Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${base}${endpoint}${qs}`;

  const headers: Record<string, string> = {};
  let bodyInit: BodyInit | undefined;

  if (body instanceof FormData) {
    bodyInit = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(body);
  }

  const auth = btoa(`${email}:${apiKey}`);

  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: `Basic ${auth}`,
    },
    body: bodyInit,
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }

  if (!response.ok) {
    const obj = parsed as Record<string, unknown> | null;
    const msg = String(obj?.msg ?? obj?.message ?? `Request failed with status ${response.status}`);
    throw new Error(`Zulip: ${msg}`);
  }

  return parsed as Record<string, unknown>;
}

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

function resolveStr(raw: unknown, itemJson: Record<string, unknown>): string {
  return String(resolveValue(raw, itemJson) ?? "");
}

export const zulipExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const cred = await getCreds(ctx);
  const base = baseUrl(cred);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    try {
      const result = await runOperation(ctx, node, cred, base, itemJson, item);
      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r, pairedItem: { item: idx, input: 0 } });
        }
      } else {
        out.push({ json: result, pairedItem: { item: idx, input: 0 } });
      }
    } catch (err) {
      if (ctx.continueOnFail()) {
        out.push({
          json: {
            error: err instanceof Error ? err.message : String(err),
          },
          pairedItem: { item: idx, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }
  return [out];
};

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  cred: ZulipCredential,
  base: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const resource = String(node.parameters.resource ?? "message");
  const operation = String(node.parameters.operation ?? "sendPrivate");

  if (resource === "message") {
    return runMessageOp(ctx, node, cred, base, itemJson, item, operation);
  }
  if (resource === "stream") {
    return runStreamOp(ctx, node, cred, base, itemJson, item, operation);
  }
  if (resource === "user") {
    return runUserOp(ctx, node, cred, base, itemJson, item, operation);
  }

  throw new Error(`Zulip: unknown resource "${resource}"`);
}

async function runMessageOp(
  ctx: ExecutionContext,
  node: INode,
  cred: ZulipCredential,
  base: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  operation: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "sendPrivate") {
    const to = node.parameters.to as string[] | undefined;
    const content = resolveStr(node.parameters.content, itemJson);
    if (!to || to.length === 0) throw new Error("Zulip: 'to' is required for sendPrivate");
    if (!content) throw new Error("Zulip: 'content' is required for sendPrivate");
    return zulipRequest(base, cred.email, cred.apiKey, "POST", "/api/v1/messages", {
      type: "private",
      to: to.join(","),
      content,
    });
  }

  if (operation === "sendStream") {
    const stream = resolveStr(node.parameters.stream, itemJson);
    const topic = resolveStr(node.parameters.topic, itemJson);
    const content = resolveStr(node.parameters.content, itemJson);
    if (!stream) throw new Error("Zulip: 'stream' is required for sendStream");
    if (!topic) throw new Error("Zulip: 'topic' is required for sendStream");
    if (!content) throw new Error("Zulip: 'content' is required for sendStream");
    return zulipRequest(base, cred.email, cred.apiKey, "POST", "/api/v1/messages", {
      type: "stream",
      stream: Number(stream),
      topic,
      content,
    });
  }

  if (operation === "get") {
    const messageId = resolveStr(node.parameters.messageId, itemJson);
    if (!messageId) throw new Error("Zulip: 'messageId' is required for get");
    return zulipRequest(base, cred.email, cred.apiKey, "GET", `/api/v1/messages/${messageId}`);
  }

  if (operation === "update") {
    const messageId = resolveStr(node.parameters.messageId, itemJson);
    if (!messageId) throw new Error("Zulip: 'messageId' is required for update");
    const updateFields = node.parameters.updateFields as Record<string, unknown> | undefined;
    const body: Record<string, unknown> = {};
    if (updateFields?.content) body.content = resolveStr(updateFields.content, itemJson);
    if (updateFields?.topic) body.topic = resolveStr(updateFields.topic, itemJson);
    if (updateFields?.propagateMode) {
      const pm = updateFields.propagateMode === "changeAll" ? "change_all"
        : updateFields.propagateMode === "changeLater" ? "change_later"
        : "change_one";
      body.propagate_mode = pm;
    }
    return zulipRequest(base, cred.email, cred.apiKey, "PATCH", `/api/v1/messages/${messageId}`, body);
  }

  if (operation === "delete") {
    const messageId = resolveStr(node.parameters.messageId, itemJson);
    if (!messageId) throw new Error("Zulip: 'messageId' is required for delete");
    return zulipRequest(base, cred.email, cred.apiKey, "DELETE", `/api/v1/messages/${messageId}`);
  }

  if (operation === "updateFile") {
    const binaryProperty = resolveStr(node.parameters.dataBinaryProperty ?? "data", itemJson);
    const binaryData = item.binary?.[binaryProperty];
    if (!binaryData) throw new Error(`Zulip: binary field "${binaryProperty}" not found`);

    let fileBuffer: ArrayBuffer;
    if (binaryData.data) {
      const binaryStr = atob(binaryData.data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      fileBuffer = bytes.buffer;
    } else {
      throw new Error("Zulip: binary data must be Base64-encoded");
    }

    const blob = new Blob([fileBuffer], { type: binaryData.mimeType ?? "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", blob, binaryData.fileName ?? "upload");

    const resp = await zulipRequest(base, cred.email, cred.apiKey, "POST", "/api/v1/user_uploads", formData);
    const uri = resolveStr(resp.uri, itemJson);
    return { ...resp, uri: uri.startsWith("/") ? `${base}${uri}` : uri };
  }

  throw new Error(`Zulip: unknown message operation "${operation}"`);
}

async function runStreamOp(
  ctx: ExecutionContext,
  node: INode,
  cred: ZulipCredential,
  base: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  operation: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const jsonParams = node.parameters.jsonParameters as boolean | undefined;
    let body: Record<string, unknown>;

    if (jsonParams) {
      const rawJson = resolveStr(node.parameters.additionalFieldsJson, itemJson);
      if (rawJson) {
        try { body = JSON.parse(rawJson); } catch { body = {}; }
      } else {
        body = {};
      }
    } else {
      const subs = node.parameters.subscriptions as { properties?: Array<{ name: string; description?: string }> } | undefined;
      const subscriptions = subs?.properties ?? [];
      if (subscriptions.length === 0) throw new Error("Zulip: at least one subscription is required for create stream");

      body = {
        subscriptions: JSON.stringify(subscriptions.map((s) => ({
          name: s.name,
          ...(s.description ? { description: s.description } : {}),
        }))),
      };

      const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
      if (additionalFields?.announce) body.announce = true;
      if (additionalFields?.authorizationErrorsFatal) body.authorization_errors_fatal = true;
      if (additionalFields?.historyPublicToSubscribers) body.history_public_to_subscribers = true;
      if (additionalFields?.inviteOnly) body.invite_only = true;
      if (additionalFields?.principals) body.principals = JSON.stringify(String(additionalFields.principals).split(",").map((s) => s.trim()));
      if (additionalFields?.streamPostPolicy != null) body.stream_post_policy = additionalFields.streamPostPolicy;
    }

    return zulipRequest(base, cred.email, cred.apiKey, "POST", "/api/v1/users/me/subscriptions", body);
  }

  if (operation === "getAll") {
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const params: Record<string, string> = {};
    if (additionalFields?.includePublic != null) params.include_public = String(additionalFields.includePublic);
    if (additionalFields?.includeSubscribed != null) params.include_subscribed = String(additionalFields.includeSubscribed);
    if (additionalFields?.includeAllActive != null) params.include_all_active = String(additionalFields.includeAllActive);
    if (additionalFields?.includeDefault != null) params.include_default = String(additionalFields.includeDefault);
    if (additionalFields?.includeOwnersubscribed != null) params.include_ownersubscribed = String(additionalFields.includeOwnersubscribed);
    const resp = await zulipRequest(base, cred.email, cred.apiKey, "GET", "/api/v1/streams", undefined, params);
    const streams = (resp.streams as Record<string, unknown>[]) ?? [];
    return streams;
  }

  if (operation === "getSubscribed") {
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const params: Record<string, string> = {};
    if (additionalFields?.includeSubscribers != null) params.include_subscribers = String(additionalFields.includeSubscribers);
    const resp = await zulipRequest(base, cred.email, cred.apiKey, "GET", "/api/v1/users/me/subscriptions", undefined, params);
    const subscriptions = (resp.subscriptions as Record<string, unknown>[]) ?? [];
    return subscriptions;
  }

  if (operation === "update") {
    const jsonParams = node.parameters.jsonParameters as boolean | undefined;
    const streamId = resolveStr(node.parameters.streamId, itemJson);
    if (!streamId) throw new Error("Zulip: 'streamId' is required for update stream");

    let body: Record<string, unknown>;
    if (jsonParams) {
      const rawJson = resolveStr(node.parameters.additionalFieldsJson, itemJson);
      try { body = rawJson ? JSON.parse(rawJson) : {}; } catch { body = {}; }
    } else {
      body = {};
      const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
      if (additionalFields?.description) body.description = resolveStr(additionalFields.description, itemJson);
      if (additionalFields?.newName) body.new_name = resolveStr(additionalFields.newName, itemJson);
      if (additionalFields?.isPrivate != null) body.is_private = additionalFields.isPrivate;
      if (additionalFields?.isAnnouncementOnly != null) body.is_announcement_only = additionalFields.isAnnouncementOnly;
      if (additionalFields?.streamPostPolicy != null) body.stream_post_policy = additionalFields.streamPostPolicy;
      if (additionalFields?.historyPublicToSubscribers != null) body.history_public_to_subscribers = additionalFields.historyPublicToSubscribers;
    }

    return zulipRequest(base, cred.email, cred.apiKey, "PATCH", `/api/v1/streams/${streamId}`, body);
  }

  if (operation === "delete") {
    const streamId = resolveStr(node.parameters.streamId, itemJson);
    if (!streamId) throw new Error("Zulip: 'streamId' is required for delete stream");
    return zulipRequest(base, cred.email, cred.apiKey, "DELETE", `/api/v1/streams/${streamId}`);
  }

  throw new Error(`Zulip: unknown stream operation "${operation}"`);
}

async function runUserOp(
  ctx: ExecutionContext,
  node: INode,
  cred: ZulipCredential,
  base: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  operation: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const email = resolveStr(node.parameters.email, itemJson);
    const fullName = resolveStr(node.parameters.fullName, itemJson);
    const password = resolveStr(node.parameters.password, itemJson);
    const shortName = resolveStr(node.parameters.shortName, itemJson);
    if (!email) throw new Error("Zulip: 'email' is required for create user");
    if (!fullName) throw new Error("Zulip: 'fullName' is required for create user");
    if (!password) throw new Error("Zulip: 'password' is required for create user");
    if (!shortName) throw new Error("Zulip: 'shortName' is required for create user");

    return zulipRequest(base, cred.email, cred.apiKey, "POST", "/api/v1/users", {
      email,
      full_name: fullName,
      password,
      short_name: shortName,
    });
  }

  if (operation === "get") {
    const userId = resolveStr(node.parameters.userId, itemJson);
    if (!userId) throw new Error("Zulip: 'userId' is required for get user");
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const params: Record<string, string> = {};
    if (additionalFields?.clientGravatar != null) params.client_gravatar = String(additionalFields.clientGravatar);
    if (additionalFields?.includeCustomProfileFields != null) params.include_custom_profile_fields = String(additionalFields.includeCustomProfileFields);
    return zulipRequest(base, cred.email, cred.apiKey, "GET", `/api/v1/users/${userId}`, undefined, params);
  }

  if (operation === "getAll") {
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const params: Record<string, string> = {};
    if (additionalFields?.clientGravatar != null) params.client_gravatar = String(additionalFields.clientGravatar);
    if (additionalFields?.includeCustomProfileFields != null) params.include_custom_profile_fields = String(additionalFields.includeCustomProfileFields);
    const resp = await zulipRequest(base, cred.email, cred.apiKey, "GET", "/api/v1/users", undefined, params);
    const members = (resp.members as Record<string, unknown>[]) ?? [];
    return members;
  }

  if (operation === "update") {
    const userId = resolveStr(node.parameters.userId, itemJson);
    if (!userId) throw new Error("Zulip: 'userId' is required for update user");
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const body: Record<string, unknown> = {};
    if (additionalFields?.fullName) body.full_name = resolveStr(additionalFields.fullName, itemJson);
    if (additionalFields?.isAdmin != null) body.is_admin = additionalFields.isAdmin;
    if (additionalFields?.isGuest != null) body.is_guest = additionalFields.isGuest;
    if (additionalFields?.role != null) body.role = additionalFields.role;
    if (additionalFields?.profileData) {
      const pd = additionalFields.profileData as { properties?: Array<{ id: string; value: string }> };
      if (pd.properties && pd.properties.length > 0) {
        body.profile_data = JSON.stringify(
          pd.properties.map((p) => ({ id: Number(p.id), value: p.value })),
        );
      }
    }
    return zulipRequest(base, cred.email, cred.apiKey, "PATCH", `/api/v1/users/${userId}`, body);
  }

  if (operation === "deactivate") {
    const userId = resolveStr(node.parameters.userId, itemJson);
    if (!userId) throw new Error("Zulip: 'userId' is required for deactivate user");
    return zulipRequest(base, cred.email, cred.apiKey, "DELETE", `/api/v1/users/${userId}`);
  }

  throw new Error(`Zulip: unknown user operation "${operation}"`);
}
