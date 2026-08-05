import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { sdkHttpRequest } from "@/sdk/helpers/http";
import { evaluateExpression } from "../../../expressions/evaluate";

const API_BASE = "https://my.demio.com/api/v1";

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

function getAdditional(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const val = params.additionalFields as Record<string, unknown> | undefined;
  if (val && typeof val === "object") return val;
  return {};
}

async function demioRequest(
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${API_BASE}${path}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}${path}`;
  const res = await sdkHttpRequest({
    method,
    url,
    headers: {
      "Api-Key": apiKey,
      "Api-Secret": apiSecret,
      "Content-Type": "application/json",
    },
    body,
    timeoutMs: 30000,
  });
  if (res.status < 200 || res.status >= 300) {
    const obj = asObj(res.body);
    const msg = String(obj.message ?? `Demio request failed with status ${res.status}`);
    throw new Error(msg);
  }
  return asObj(res.body);
}

async function getCredentials(ctx: ExecutionContext): Promise<{ apiKey: string; apiSecret: string }> {
  const cred = await ctx.getCredential("demioApi");
  if (!cred) throw new Error("Demio: demioApi credential is not configured");
  const apiKey = String(cred.apiKey ?? "");
  const apiSecret = String(cred.apiSecret ?? "");
  if (!apiKey || !apiSecret) throw new Error("Demio: API key and API secret are required");
  return { apiKey, apiSecret };
}

async function runEventGet(
  ctx: ExecutionContext,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  const { apiKey, apiSecret } = await getCredentials(ctx);
  const eventId = String(resolveValue(params.eventId, itemJson) ?? "");
  if (!eventId) throw new Error("Demio: eventId is required");
  const qs: Record<string, string> = {};
  const add = getAdditional(params);
  if (add.active) qs.active = add.active === true ? "1" : "0";
  if (add.date_id) qs.date_id = String(add.date_id);
  const res = await demioRequest(apiKey, apiSecret, "GET", `/event/${eventId}`, undefined, qs);
  return [{ json: res }];
}

async function runEventGetAll(
  ctx: ExecutionContext,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  const { apiKey, apiSecret } = await getCredentials(ctx);
  const returnAll = Boolean(params.returnAll);
  const limit = Number(params.limit ?? 25);
  const filters = params.filters as Record<string, unknown> | undefined;
  const qs: Record<string, string> = {};
  if (filters?.type) qs.type = String(resolveValue(filters.type, itemJson));
  const raw = await demioRequest(apiKey, apiSecret, "GET", "/events", undefined, qs);
  const arr = (raw.data && Array.isArray(raw.data)) ? (raw.data as Record<string, unknown>[]) : Array.isArray(raw) ? raw : [];
  const sliced = returnAll ? arr : arr.slice(0, limit);
  return sliced.map((e) => ({ json: e }));
}

async function runEventRegister(
  ctx: ExecutionContext,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  const { apiKey, apiSecret } = await getCredentials(ctx);
  const eventId = String(resolveValue(params.eventId, itemJson) ?? "");
  if (!eventId) throw new Error("Demio: eventId is required");
  const email = String(resolveValue(params.email, itemJson) ?? "");
  if (!email) throw new Error("Demio: email is required");
  const body: Record<string, unknown> = { email };
  const firstName = resolveValue(params.firstName, itemJson);
  if (firstName) body.first_name = String(firstName);
  const add = getAdditional(params);
  if (add.last_name) body.last_name = String(add.last_name);
  if (add.company) body.company = String(add.company);
  if (add.phone_number) body.phone_number = String(add.phone_number);
  if (add.website) body.website = String(add.website);
  if (add.ref_url) body.ref_url = String(add.ref_url);
  if (add.gdpr) body.gdpr = { consent: add.gdpr === "true" || add.gdpr === true };
  if (add.date_id) body.date_id = String(add.date_id);
  if (add.customFieldsUi) {
    const pairs = (add.customFieldsUi as Record<string, unknown>).customFieldsValues as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(pairs)) {
      body.custom_fields = pairs.reduce((acc: Record<string, string>, p) => {
        const k = String(p.name ?? "");
        if (k) acc[k] = String(p.value ?? "");
        return acc;
      }, {});
    }
  }
  const res = await demioRequest(apiKey, apiSecret, "PUT", `/event/${eventId}/register`, body);
  return [{ json: res }];
}

async function runReportGet(
  ctx: ExecutionContext,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  const { apiKey, apiSecret } = await getCredentials(ctx);
  const eventId = String(resolveValue(params.eventId, itemJson) ?? "");
  if (!eventId) throw new Error("Demio: eventId is required");
  const qs: Record<string, string> = {};
  const dateId = resolveValue(params.dateId, itemJson);
  if (dateId) qs.date_id = String(dateId);
  const filters = params.filters as Record<string, unknown> | undefined;
  if (filters?.status) qs.status = String(resolveValue(filters.status, itemJson));
  const res = await sdkHttpRequest({
    method: "GET",
    url: `${API_BASE}/report/${eventId}${Object.keys(qs).length ? "?" + new URLSearchParams(qs).toString() : ""}`,
    headers: { "Api-Key": apiKey, "Api-Secret": apiSecret, "Content-Type": "application/json" },
    timeoutMs: 30000,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Demio report request failed with status ${res.status}`);
  }
  const data = Array.isArray(res.body) ? res.body : [res.body];
  return (data as Record<string, unknown>[]).map((r) => ({ json: r }));
}

export const demioExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "event");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let results: INodeExecutionData[];
      if (resource === "event") {
        if (operation === "get") {
          results = await runEventGet(ctx, node.parameters, itemJson);
        } else if (operation === "getAll") {
          results = await runEventGetAll(ctx, node.parameters, itemJson);
        } else if (operation === "register") {
          results = await runEventRegister(ctx, node.parameters, itemJson);
        } else {
          throw new Error(`Demio: unsupported event operation "${operation}"`);
        }
      } else if (resource === "report") {
        if (operation === "get") {
          results = await runReportGet(ctx, node.parameters, itemJson);
        } else {
          throw new Error(`Demio: unsupported report operation "${operation}"`);
        }
      } else {
        throw new Error(`Demio: unsupported resource "${resource}"`);
      }
      for (const r of results) {
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
