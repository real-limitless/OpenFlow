import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "@/lib/expressions/evaluate";

const API_BASE = "https://api.dropcontact.com/v1";

const PER_CONTACT_FIELDS = [
  "email", "first_name", "last_name", "full_name", "phone",
  "company", "website", "num_siren", "siret", "linkedin",
  "company_linkedin", "country", "job",
] as const;

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("dropcontactApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Dropcontact: dropcontactApi credential is not configured");
  }
  return apiKey;
}

async function dropcontactPost(
  path: string,
  body: unknown,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return parseResponse(response);
  } finally {
    clearTimeout(timer);
  }
}

async function dropcontactGet(
  path: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": apiKey,
      },
      signal: controller.signal,
    });
    return parseResponse(response);
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  const obj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { data: parsed };
  if (response.status === 429) {
    throw new Error("Dropcontact: rate limited (HTTP 429)");
  }
  if (response.status < 200 || response.status >= 300) {
    const desc = obj.message ? String(obj.message) : `HTTP ${response.status}`;
    throw new Error(`Dropcontact: ${desc}`);
  }
  return obj;
}

export const dropcontactExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = String(node.parameters.operation ?? "enrich");
  const continueOnFail = ctx.continueOnFail();

  try {
    if (operation === "enrich") {
      return [await doEnrich(ctx, node, items)];
    }
    if (operation === "fetchRequest") {
      return [await doFetchRequest(ctx, node)];
    }
    throw new Error(`Dropcontact: unsupported operation "${operation}"`);
  } catch (err) {
    if (!continueOnFail) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return [[{ json: { error: message } }]];
  }
};

function buildDataEntry(
  item: INodeExecutionData,
  additionalFields: Record<string, unknown>,
  emailParam: string,
): Record<string, unknown> {
  const json = item.json ?? {};
  const entry: Record<string, unknown> = {};
  for (const field of PER_CONTACT_FIELDS) {
    const direct = resolveValue(additionalFields[field], json);
    const resolved = direct !== undefined && direct !== null && direct !== ""
      ? String(direct)
      : "";
    if (resolved) {
      entry[field] = resolved;
    }
  }
  if (!entry.email && emailParam) {
    const resolved = resolveValue(emailParam, json);
    if (resolved && String(resolved).trim()) {
      entry.email = String(resolved).trim();
    }
  }
  return entry;
}

function simplifyEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    flat[k] = v;
  }
  return flat;
}

async function doEnrich(
  ctx: ExecutionContext,
  node: INode,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const apiKey = await getApiKey(ctx);
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const simplify = Boolean(node.parameters.simplify ?? false);
  const waitTime = Number(resolveValue(options.waitTime, {}) ?? 0);
  const additionalFields = (node.parameters.additionalFields ??
    {}) as Record<string, unknown>;
  const emailParam = String(node.parameters.email ?? "");

  const data: Record<string, unknown>[] = [];
  for (const item of items) {
    data.push(buildDataEntry(item, additionalFields, emailParam));
  }

  const postBody: Record<string, unknown> = { data };
  if (options.siren) postBody.siren = Boolean(options.siren);
  if (options.language) {
    const lang = resolveValue(options.language, {});
    if (lang) postBody.language = String(lang);
  }
  const customCallbackUrl = resolveValue(
    (options as Record<string, unknown>).customCallbackUrl,
    {},
  );
  if (customCallbackUrl) {
    postBody.custom_callback_url = String(customCallbackUrl);
  }

  const postResult = await dropcontactPost("/enrich/all", postBody, apiKey);

  if (!waitTime) {
    const meta = postResult as Record<string, unknown>;
    return [{ json: meta }];
  }

  await new Promise((resolve) => setTimeout(resolve, waitTime));

  const requestId = postResult.request_id ?? postResult.requestId;
  if (!requestId) {
    throw new Error("Dropcontact: no request_id in POST response for polling");
  }

  const pollResult = await dropcontactGet(
    `/enrich/all/${String(requestId)}`,
    apiKey,
  );

  const pollData = (pollResult.data ?? pollResult) as
    | Record<string, unknown>[]
    | undefined;

  if (Array.isArray(pollData)) {
    if (simplify) {
      return pollData.map((entry: Record<string, unknown>) => ({
        json: simplifyEntry(entry),
      }));
    }
    return pollData.map((entry: Record<string, unknown>) => ({
      json: entry,
    }));
  }

  const single = pollResult as Record<string, unknown>;
  if (simplify) {
    const flat: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(single)) {
      if (k !== "data") flat[k] = v;
    }
    return [{ json: flat }];
  }
  return [{ json: single }];
}

async function doFetchRequest(
  ctx: ExecutionContext,
  node: INode,
): Promise<INodeExecutionData[]> {
  const apiKey = await getApiKey(ctx);
  const requestId = String(
    resolveValue(node.parameters.requestId, {}) ?? "",
  ).trim();
  if (!requestId) {
    throw new Error(
      "Dropcontact: requestId is required for fetchRequest operation",
    );
  }
  const result = await dropcontactGet(`/enrich/all/${requestId}`, apiKey);
  const data = (result.data ?? result) as Record<string, unknown>[] | undefined;
  if (Array.isArray(data)) {
    return data.map((entry: Record<string, unknown>) => ({ json: entry }));
  }
  return [{ json: result as Record<string, unknown> }];
}
