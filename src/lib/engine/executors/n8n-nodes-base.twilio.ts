import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.twilio.com/2010-04-01/Accounts";

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

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const twilioExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "sms");
  const operation = String(node.parameters.operation ?? "send");
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

async function getCredentials(
  ctx: ExecutionContext,
  node: INode,
): Promise<{ accountSid: string; authToken: string }> {
  const cred = await ctx.getCredential("twilioApi");
  const accountSid = cred ? String(cred.accountSid ?? "") : "";
  const authToken = cred ? String(cred.authToken ?? "") : "";
  if (!accountSid || !authToken) {
    throw new Error("Twilio: twilioApi credential is not configured");
  }
  return { accountSid, authToken };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (resource === "sms") {
    return runSmsOperation(ctx, node, operation, itemJson);
  }
  if (resource === "call") {
    return runCallOperation(ctx, node, operation, itemJson);
  }
  if (resource === "message") {
    return runMessageOperation(ctx, node, operation, itemJson);
  }
  throw new Error(`Twilio: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

async function runSmsOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation !== "send") {
    throw new Error(`Twilio: unsupported sms operation "${operation}"`);
  }
  const { accountSid, authToken } = await getCredentials(ctx, node);
  const from = String(resolveValue(node.parameters.fromNumber, itemJson) ?? "");
  const to = String(resolveValue(node.parameters.toNumber, itemJson) ?? "");
  const body = String(resolveValue(node.parameters.message, itemJson) ?? "");
  if (!from) throw new Error("Twilio: fromNumber is required");
  if (!to) throw new Error("Twilio: toNumber is required");

  const form: Record<string, string> = { To: to, From: from };
  if (body) form.Body = body;

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const mediaUrl = resolveValue(additionalFields.mediaUrl, itemJson);
  if (mediaUrl) form.MediaUrl = String(mediaUrl);

  const res = await twilioRequest(accountSid, authToken, "POST", `${accountSid}/Messages.json`, form);
  return { json: asObj(res) };
}

// ---------------------------------------------------------------------------
// Call
// ---------------------------------------------------------------------------

async function runCallOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation !== "make") {
    throw new Error(`Twilio: unsupported call operation "${operation}"`);
  }
  const { accountSid, authToken } = await getCredentials(ctx, node);
  const from = String(resolveValue(node.parameters.fromNumber, itemJson) ?? "");
  const to = String(resolveValue(node.parameters.toNumber, itemJson) ?? "");
  if (!from) throw new Error("Twilio: fromNumber is required");
  if (!to) throw new Error("Twilio: toNumber is required");

  const form: Record<string, string> = { To: to, From: from };

  const twimlUrl = resolveValue(node.parameters.twimlUrl, itemJson);
  const twimlMessage = resolveValue(node.parameters.twimlMessage, itemJson);
  if (twimlUrl) {
    form.Url = String(twimlUrl);
  } else if (twimlMessage) {
    form.Twiml = String(twimlMessage);
  } else {
    throw new Error("Twilio: twimlUrl or twimlMessage is required");
  }

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  if (additionalFields.timeout) form.Timeout = String(additionalFields.timeout);
  if (additionalFields.statusCallback) form.StatusCallback = String(additionalFields.statusCallback);

  const res = await twilioRequest(accountSid, authToken, "POST", `${accountSid}/Calls.json`, form);
  return { json: asObj(res) };
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

async function runMessageOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { accountSid, authToken } = await getCredentials(ctx, node);

  if (operation === "get") {
    const sid = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!sid) throw new Error("Twilio: messageId is required");
    const res = await twilioRequest(accountSid, authToken, "GET", `${accountSid}/Messages/${sid}.json`);
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const sid = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!sid) throw new Error("Twilio: messageId is required");
    await twilioRequest(accountSid, authToken, "DELETE", `${accountSid}/Messages/${sid}.json`);
    return { json: { success: true } };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = { PageSize: String(returnAll ? 1000 : Math.min(limit, 1000)) };
    const from = resolveValue(filters.from, itemJson);
    if (from) params.From = String(from);
    const to = resolveValue(filters.to, itemJson);
    if (to) params.To = String(to);
    const dateSent = resolveValue(filters.dateSent, itemJson);
    if (dateSent) params.DateSent = String(dateSent);

    const messages = await twilioRequestAll(
      accountSid,
      authToken,
      `${accountSid}/Messages.json`,
      params,
      returnAll,
      limit,
    );
    return messages.map((m) => ({ json: m }));
  }

  throw new Error(`Twilio: unsupported message operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function basicAuthHeader(accountSid: string, authToken: string): string {
  return "Basic " + btoa(`${accountSid}:${authToken}`);
}

async function twilioRequest(
  accountSid: string,
  authToken: string,
  method: string,
  path: string,
  form?: Record<string, string>,
): Promise<unknown> {
  const url = `${API_BASE}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: basicAuthHeader(accountSid, authToken),
      },
      signal: controller.signal,
    };
    if (form && method !== "GET" && method !== "DELETE") {
      init.headers = {
        ...init.headers,
        "Content-Type": "application/x-www-form-urlencoded",
      };
      init.body = new URLSearchParams(form).toString();
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
      const errMsg = String(obj.message ?? obj.error ?? `HTTP ${response.status}`);
      throw new Error(errMsg);
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Twilio")) {
      throw err;
    }
    if (err instanceof Error && !err.message.includes("Twilio")) {
      throw new Error(`Twilio request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function twilioRequestAll(
  accountSid: string,
  authToken: string,
  path: string,
  params: Record<string, string>,
  returnAll: boolean,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let nextUri = "";

  const firstParams = new URLSearchParams(params).toString();
  const firstRes = await twilioRequest(
    accountSid,
    authToken,
    "GET",
    `${path}?${firstParams}`,
  ) as Record<string, unknown>;
  const firstMessages = (firstRes.messages ?? []) as Record<string, unknown>[];
  results.push(...firstMessages);
  nextUri = String(firstRes.next_page_uri ?? "");

  while (returnAll && nextUri) {
    const res = await twilioRequest(accountSid, authToken, "GET", nextUri.replace(`${API_BASE}/`, "")) as Record<string, unknown>;
    const messages = (res.messages ?? []) as Record<string, unknown>[];
    results.push(...messages);
    nextUri = String(res.next_page_uri ?? "");
  }

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}