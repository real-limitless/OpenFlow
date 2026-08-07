import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

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

interface SendyCredential {
  url?: string;
  apiKey?: string;
}

async function getCredential(ctx: ExecutionContext): Promise<{ baseUrl: string; apiKey: string }> {
  const cred = await ctx.getCredential("sendyApi") as SendyCredential | null;
  const baseUrl = cred?.url ? String(cred.url).replace(/\/+$/, "") : "";
  const apiKey = cred?.apiKey ? String(cred.apiKey) : "";
  if (!baseUrl || !apiKey) {
    throw new Error("Sendy: sendyApi credential is not configured (requires url + apiKey)");
  }
  return { baseUrl, apiKey };
}

function buildForm(body: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) params.set(k, v);
  }
  return params;
}

async function sendyPost(url: string, form: URLSearchParams): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!text || response.status < 200 || response.status >= 300) {
      throw new Error(text || `HTTP ${response.status}`);
    }
    const trimmed = text.trim();

    // Subscriber count returns a bare number
    const asNum = Number(trimmed);
    if (!isNaN(asNum) && trimmed !== "" && !trimmed.includes(" ")) {
      return { count: trimmed };
    }

    // Subscription status returns one of these known strings
    const knownStatuses = [
      "Subscribed", "Unsubscribed", "Unconfirmed",
      "Bounced", "Soft bounced", "Complained",
    ];
    if (knownStatuses.includes(trimmed)) {
      return { status: trimmed };
    }

    // Campaign create success messages
    if (
      trimmed.includes("Campaign created") ||
      trimmed.includes("created and now sending")
    ) {
      return { message: trimmed };
    }

    // JSON response
    if (trimmed.startsWith("{")) {
      return JSON.parse(trimmed) as Record<string, unknown>;
    }

    // Boolean success "true" / "1"
    if (trimmed === "true" || trimmed === "1") {
      return { success: true };
    }

    // Anything else is an error
    throw new Error(trimmed);
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith("Sendy") || err.message.includes("HTTP"))) {
      throw err;
    }
    if (err instanceof Error) {
      throw new Error(`Sendy request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const sendyExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "subscriber");
  const operation = String(node.parameters.operation ?? "add");
  const continueOnFail = ctx.continueOnFail();

  const { baseUrl, apiKey } = await getCredential(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, baseUrl, apiKey);
      out.push({ json: result, pairedItem });
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
  baseUrl: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  if (resource === "subscriber") {
    return runSubscriberOperation(ctx, node, operation, itemJson, baseUrl, apiKey);
  }
  if (resource === "campaign") {
    return runCampaignOperation(ctx, node, operation, itemJson, baseUrl, apiKey);
  }
  throw new Error(`Sendy: unsupported resource "${resource}"`);
}

async function runSubscriberOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");

  if (operation === "add") {
    if (!email || !listId) throw new Error("Sendy: email and listId are required for subscriber add");
    const body: Record<string, string> = { email, list: listId, api_key: apiKey, boolean: "true" };
    const additional = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additional) {
      if (additional.name) body.name = String(additional.name);
      if (additional.country) body.country = String(additional.country);
      if (additional.ipaddress) body.ipaddress = String(additional.ipaddress);
      if (additional.referrer) body.referrer = String(additional.referrer);
      if (additional.gdpr) body.gdpr = "true";
      if (additional.silent) body.silent = "true";
      if (additional.hp) body.hp = "true";
    }
    const form = buildForm(body);
    return sendyPost(`${baseUrl}/subscribe`, form);
  }

  if (operation === "count") {
    if (!listId) throw new Error("Sendy: listId is required for subscriber count");
    const body: Record<string, string> = { list_id: listId, api_key: apiKey, boolean: "true" };
    const form = buildForm(body);
    return sendyPost(`${baseUrl}/api/subscribers/active-subscriber-count.php`, form);
  }

  if (operation === "delete") {
    if (!email || !listId) throw new Error("Sendy: email and listId are required for subscriber delete");
    const body: Record<string, string> = { email, list_id: listId, api_key: apiKey, boolean: "true" };
    const form = buildForm(body);
    return sendyPost(`${baseUrl}/api/subscribers/delete.php`, form);
  }

  if (operation === "remove") {
    if (!email || !listId) throw new Error("Sendy: email and listId are required for subscriber remove");
    const body: Record<string, string> = { email, list: listId, api_key: apiKey, boolean: "true" };
    const form = buildForm(body);
    return sendyPost(`${baseUrl}/unsubscribe`, form);
  }

  if (operation === "status") {
    if (!email || !listId) throw new Error("Sendy: email and listId are required for subscriber status check");
    const body: Record<string, string> = { email, list_id: listId, api_key: apiKey, boolean: "true" };
    const form = buildForm(body);
    return sendyPost(`${baseUrl}/api/subscribers/subscription-status.php`, form);
  }

  throw new Error(`Sendy: unsupported subscriber operation "${operation}"`);
}

async function runCampaignOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  if (operation === "create") {
    const fromName = String(resolveValue(node.parameters.fromName, itemJson) ?? "");
    const fromEmail = String(resolveValue(node.parameters.fromEmail, itemJson) ?? "");
    const replyTo = String(resolveValue(node.parameters.replyTo, itemJson) ?? "");
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    const subject = String(resolveValue(node.parameters.subject, itemJson) ?? "");
    const htmlText = String(resolveValue(node.parameters.htmlText, itemJson) ?? "");

    if (!fromName || !fromEmail || !replyTo || !title || !subject || !htmlText) {
      throw new Error("Sendy: fromName, fromEmail, replyTo, title, subject, and htmlText are required for campaign create");
    }

    const sendCampaign = Boolean(resolveValue(node.parameters.sendCampaign, itemJson));
    const brandId = String(resolveValue(node.parameters.brandId, itemJson) ?? "");

    if (!sendCampaign && !brandId) {
      throw new Error("Sendy: brandId is required when sendCampaign is false");
    }

    const body: Record<string, string> = {
      api_key: apiKey,
      boolean: "true",
      from_name: fromName,
      from_email: fromEmail,
      reply_to: replyTo,
      title,
      subject,
      html_text: htmlText,
      send_campaign: sendCampaign ? "true" : "false",
    };

    if (brandId) body.brand_id = brandId;

    const additional = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additional) {
      if (additional.plainText) body.plain_text = String(additional.plainText);
      if (additional.listIds) body.list_ids = String(additional.listIds);
      if (additional.segmentIds) body.segment_ids = String(additional.segmentIds);
      if (additional.excludeListIds) body.exclude_list_ids = String(additional.excludeListIds);
      if (additional.excludeSegmentIds) body.exclude_segment_ids = String(additional.excludeSegmentIds);
      if (additional.queryString) body.query_string = String(additional.queryString);
      if (additional.trackOpens !== undefined) body.track_opens = Boolean(additional.trackOpens) ? "true" : "false";
      if (additional.trackClicks !== undefined) body.track_clicks = Boolean(additional.trackClicks) ? "true" : "false";
    }

    const form = buildForm(body);
    return sendyPost(`${baseUrl}/api/campaigns/create.php`, form);
  }

  throw new Error(`Sendy: unsupported campaign operation "${operation}"`);
}
