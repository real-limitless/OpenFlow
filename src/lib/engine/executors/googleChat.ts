import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const CHAT_API = "https://chat.googleapis.com/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function encodePath(segment: string): string {
  return segment
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
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
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleChatOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleChat: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleChat: ${credName} has no accessToken`);
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
    throw new Error(`GoogleChat: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

async function requestAllPages(
  token: string,
  baseUrl: string,
  itemsKey: string,
  returnAll: boolean,
  limit: number,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  const pageSize = returnAll ? Math.max(limit, 1000) : Math.min(limit, 1000);
  do {
    const query = buildQuery({ ...params, pageSize: String(pageSize), pageToken });
    const res = await apiRequest("GET", `${baseUrl}${query}`, token);
    const body = asObj(res.body);
    const items = (body[itemsKey] ?? []) as Record<string, unknown>[];
    all.push(...items);
    pageToken = (body.nextPageToken as string) ?? undefined;
    if (!returnAll && all.length >= limit) break;
  } while (pageToken);
  return returnAll ? all : all.slice(0, limit);
}

export const googleChatExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "message");
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
        out.push({ json: r.json, binary: r.binary, pairedItem });
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
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<
  | { json: Record<string, unknown>; binary?: Record<string, IBinaryData> }
  | { json: Record<string, unknown>; binary?: Record<string, IBinaryData> }[]
> {
  if (resource === "member") {
    return runMemberOperation(ctx, node, operation, itemJson);
  }
  if (resource === "message") {
    return runMessageOperation(ctx, node, operation, itemJson);
  }
  if (resource === "space") {
    return runSpaceOperation(ctx, node, operation, itemJson);
  }
  throw new Error(`GoogleChat: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

async function runMemberOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<
  | { json: Record<string, unknown>; binary?: Record<string, IBinaryData> }
  | { json: Record<string, unknown>; binary?: Record<string, IBinaryData> }[]
> {
  const token = await getAccessToken(ctx, node);

  if (operation === "getAll") {
    const spaceId = String(resolveValue(node.parameters.spaceId, itemJson) ?? "").trim();
    if (!spaceId) throw new Error("GoogleChat: spaceId is required for member getAll");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const url = `${CHAT_API}/${encodePath(spaceId)}/members`;
    const members = await requestAllPages(token, url, "memberships", returnAll, limit);
    return members.map((m) => ({ json: m as Record<string, unknown> }));
  }

  if (operation === "get") {
    const memberId = String(resolveValue(node.parameters.memberId, itemJson) ?? "").trim();
    if (!memberId) throw new Error("GoogleChat: memberId is required for member get");
    const url = `${CHAT_API}/${encodePath(memberId)}`;
    const res = await apiRequest("GET", url, token);
    return { json: asObj(res.body) };
  }

  throw new Error(`GoogleChat: unsupported member operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

async function runMessageOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<
  | { json: Record<string, unknown>; binary?: Record<string, IBinaryData> }
  | { json: Record<string, unknown>; binary?: Record<string, IBinaryData> }[]
> {
  const token = await getAccessToken(ctx, node);

  if (operation === "create") {
    const spaceId = String(resolveValue(node.parameters.spaceId, itemJson) ?? "").trim();
    if (!spaceId) throw new Error("GoogleChat: spaceId is required for message create");
    const jsonParameters = Boolean(node.parameters.jsonParameters);
    let body: Record<string, unknown>;
    if (jsonParameters) {
      const messageJson = node.parameters.messageJson;
      if (messageJson && typeof messageJson === "object" && !Array.isArray(messageJson)) {
        body = messageJson as Record<string, unknown>;
      } else if (typeof messageJson === "string" && messageJson.trim()) {
        try {
          body = JSON.parse(messageJson);
        } catch {
          throw new Error("GoogleChat: messageJson is not valid JSON");
        }
      } else {
        throw new Error("GoogleChat: messageJson is required when jsonParameters=true");
      }
    } else {
      const messageUi = (node.parameters.messageUi ?? {}) as Record<string, unknown>;
      const text = String(resolveValue(messageUi.text, itemJson) ?? "");
      if (!text) throw new Error("GoogleChat: messageUi.text is required for message create");
      body = { text };
    }
    const requestId = String(
      resolveValue(
        node.parameters.additionalFields?.requestId ?? node.parameters.requestId,
        itemJson,
      ) ?? "",
    );
    if (requestId) body.requestId = requestId;
    const url = `${CHAT_API}/${encodePath(spaceId)}/messages`;
    const res = await apiRequest("POST", url, token, body);
    return { json: asObj(res.body) };
  }

  if (operation === "delete") {
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "").trim();
    if (!messageId) throw new Error("GoogleChat: messageId is required for message delete");
    const url = `${CHAT_API}/${encodePath(messageId)}`;
    await apiRequest("DELETE", url, token);
    return { json: itemJson };
  }

  if (operation === "get") {
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "").trim();
    if (!messageId) throw new Error("GoogleChat: messageId is required for message get");
    const url = `${CHAT_API}/${encodePath(messageId)}`;
    const res = await apiRequest("GET", url, token);
    return { json: asObj(res.body) };
  }

  if (operation === "sendAndWait") {
    const spaceId = String(resolveValue(node.parameters.spaceId, itemJson) ?? "").trim();
    if (!spaceId) throw new Error("GoogleChat: spaceId is required for sendAndWait");
    const message = String(resolveValue(node.parameters.message, itemJson) ?? "");
    if (!message) throw new Error("GoogleChat: message is required for sendAndWait");
    const responseType = String(node.parameters.responseType ?? "approval");

    const approvalOptions = (node.parameters.approvalOptions ?? {}) as Record<string, unknown>;
    const approvalValues = (approvalOptions.values ?? {}) as Record<string, unknown>;
    const approvalType = String(approvalValues.approvalType ?? "single");
    const approveLabel = String(approvalValues.approveLabel ?? "✅ Approve");
    const disapproveLabel = String(approvalValues.disapproveLabel ?? "❌ Decline");

    const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
    const limitWaitTime = (opts.limitWaitTime ?? {}) as Record<string, unknown>;
    const limitType = String(limitWaitTime.limitType ?? "afterTimeInterval");
    const resumeAmount = Number(limitWaitTime.resumeAmount ?? 0);
    const resumeUnit = String(limitWaitTime.resumeUnit ?? "minutes");
    const maxDateAndTime = String(limitWaitTime.maxDateAndTime ?? "");
    const hasLimitWait = Boolean(
      limitType && (resumeAmount > 0 || (limitType === "atSpecifiedTime" && maxDateAndTime)),
    );
    const appendAttribution = Boolean(opts.appendAttribution ?? true);
    const messageButtonLabel = String(opts.messageButtonLabel ?? "");
    const responseFormTitle = String(opts.responseFormTitle ?? "");
    const responseFormDescription = String(opts.responseFormDescription ?? "");
    const responseFormButtonLabel = String(opts.responseFormButtonLabel ?? "");
    const responseFormCustomCss = String(opts.responseFormCustomCss ?? "");

    const cards: Record<string, unknown>[] = [
      {
        header: {
          title: appendAttribution ? "n8n workflow" : undefined,
        },
        sections: [
          {
            widgets: buildInteractiveWidgets(responseType, {
              message,
              approveLabel,
              disapproveLabel,
              approvalType,
              messageButtonLabel,
              responseFormTitle,
              responseFormDescription,
              responseFormButtonLabel,
            }),
          },
        ],
      },
    ];

    const url = `${CHAT_API}/${encodePath(spaceId)}/messages`;
    const body: Record<string, unknown> = {
      text: message,
      cardsV2: [{ cardId: "n8n-card", card: cards[0] }],
    };
    await apiRequest("POST", url, token, body);

    if (hasLimitWait) {
      const ms =
        limitType === "atSpecifiedTime"
          ? Math.max(0, new Date(maxDateAndTime).getTime() - Date.now())
          : resumeAmount *
            (resumeUnit === "hours" ? 3600 : resumeUnit === "days" ? 86400 : 60) *
            1000;
      if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
    }

    const data = buildSendAndWaitData(responseType);
    return { json: { data } };
  }

  if (operation === "update") {
    const spaceId = String(resolveValue(node.parameters.spaceId, itemJson) ?? "").trim();
    if (!spaceId) throw new Error("GoogleChat: spaceId is required for message update");
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "").trim();
    if (!messageId) throw new Error("GoogleChat: messageId is required for message update");
    const jsonParameters = Boolean(node.parameters.jsonParameters);
    let body: Record<string, unknown>;
    if (jsonParameters) {
      const updateFieldsJson = node.parameters.updateFieldsJson;
      if (
        updateFieldsJson &&
        typeof updateFieldsJson === "object" &&
        !Array.isArray(updateFieldsJson)
      ) {
        body = updateFieldsJson as Record<string, unknown>;
      } else if (typeof updateFieldsJson === "string" && updateFieldsJson.trim()) {
        try {
          body = JSON.parse(updateFieldsJson);
        } catch {
          throw new Error("GoogleChat: updateFieldsJson is not valid JSON");
        }
      } else {
        throw new Error("GoogleChat: updateFieldsJson is required when jsonParameters=true");
      }
    } else {
      const updateFieldsUi = (node.parameters.updateFieldsUi ?? {}) as Record<string, unknown>;
      const text = String(resolveValue(updateFieldsUi.text, itemJson) ?? "");
      if (!text) throw new Error("GoogleChat: updateFieldsUi.text is required for message update");
      body = { text };
    }
    const url = `${CHAT_API}/${encodePath(messageId)}`;
    const res = await apiRequest("PATCH", url, token, body);
    return { json: asObj(res.body) };
  }

  throw new Error(`GoogleChat: unsupported message operation "${operation}"`);
}

function buildInteractiveWidgets(
  responseType: string,
  opts: {
    message: string;
    approveLabel: string;
    disapproveLabel: string;
    approvalType: string;
    messageButtonLabel: string;
    responseFormTitle: string;
    responseFormDescription: string;
    responseFormButtonLabel: string;
  },
): Record<string, unknown>[] {
  if (responseType === "approval") {
    const buttons: Record<string, unknown>[] = [
      {
        buttonList: {
          buttons: [
            {
              text: opts.approveLabel,
              onClick: {
                action: {
                  function: "n8n_approve",
                  parameters: [{ key: "approved", value: "true" }],
                },
              },
            },
          ],
        },
      },
    ];
    if (opts.approvalType === "double") {
      (buttons[0].buttonList as Record<string, unknown>).buttons.push({
        text: opts.disapproveLabel,
        onClick: {
          action: {
            function: "n8n_approve",
            parameters: [{ key: "approved", value: "false" }],
          },
        },
      });
    }
    return buttons;
  }

  if (responseType === "freeText") {
    const widgets: Record<string, unknown>[] = [];
    if (opts.responseFormTitle) {
      widgets.push({ textParagraph: { text: `<b>${opts.responseFormTitle}</b>` } });
    }
    if (opts.responseFormDescription) {
      widgets.push({ textParagraph: { text: opts.responseFormDescription } });
    }
    widgets.push({
      buttonList: {
        buttons: [
          {
            text: opts.responseFormButtonLabel || opts.messageButtonLabel || "Reply",
            onClick: {
              action: {
                function: "n8n_free_text",
                parameters: [{ key: "responseType", value: "freeText" }],
              },
            },
          },
        ],
      },
    });
    return widgets;
  }

  if (responseType === "customForm") {
    const widgets: Record<string, unknown>[] = [];
    if (opts.responseFormTitle) {
      widgets.push({ textParagraph: { text: `<b>${opts.responseFormTitle}</b>` } });
    }
    if (opts.responseFormDescription) {
      widgets.push({ textParagraph: { text: opts.responseFormDescription } });
    }
    widgets.push({
      buttonList: {
        buttons: [
          {
            text: opts.responseFormButtonLabel || opts.messageButtonLabel || "Open Form",
            onClick: {
              action: {
                function: "n8n_custom_form",
                parameters: [{ key: "responseType", value: "customForm" }],
              },
            },
          },
        ],
      },
    });
    return widgets;
  }

  return [];
}

function buildSendAndWaitData(responseType: string): Record<string, unknown> {
  if (responseType === "approval") {
    return { approved: true, message: "Approved" };
  }
  if (responseType === "freeText") {
    return { text: "" };
  }
  if (responseType === "customForm") {
    return { values: {} };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Space
// ---------------------------------------------------------------------------

async function runSpaceOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<
  | { json: Record<string, unknown>; binary?: Record<string, IBinaryData> }
  | { json: Record<string, unknown>; binary?: Record<string, IBinaryData> }[]
> {
  const token = await getAccessToken(ctx, node);

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const url = `${CHAT_API}/spaces`;
    const spaces = await requestAllPages(token, url, "spaces", returnAll, limit);
    return spaces.map((s) => ({ json: s }));
  }

  if (operation === "get") {
    const spaceId = String(resolveValue(node.parameters.spaceId, itemJson) ?? "").trim();
    if (!spaceId) throw new Error("GoogleChat: spaceId is required for space get");
    const url = `${CHAT_API}/${encodePath(spaceId)}`;
    const res = await apiRequest("GET", url, token);
    return { json: asObj(res.body) };
  }

  throw new Error(`GoogleChat: unsupported space operation "${operation}"`);
}
