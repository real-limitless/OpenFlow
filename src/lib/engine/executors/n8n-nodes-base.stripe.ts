import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.stripe.com/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function toVal(raw: unknown, itemJson: Record<string, unknown>): string {
  const v = resolveValue(raw, itemJson);
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNum(raw: unknown, itemJson: Record<string, unknown>): number {
  const v = resolveValue(raw, itemJson);
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildFormBody(data: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (sv !== undefined && sv !== null && sv !== "") {
          params.append(`${k}[${sk}]`, String(sv));
        }
      }
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null && item !== "") {
          params.append(`${k}[]`, String(item));
        }
      }
    } else {
      params.append(k, String(v));
    }
  }
  return params;
}

async function stripeFetch(
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    const text = await resp.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
    }
    if (resp.status < 200 || resp.status >= 300) {
      const obj = (parsed ?? {}) as Record<string, unknown>;
      const errMsg = String(
        (obj as Record<string, unknown>).error
          ? ((obj as Record<string, unknown>).error as Record<string, unknown>).message ?? ""
          : `Stripe request failed ${resp.status}`,
      );
      const errType = String(
        (obj as Record<string, unknown>).error
          ? ((obj as Record<string, unknown>).error as Record<string, unknown>).type ?? ""
          : "",
      );
      const error = new Error(errMsg || `Stripe request failed ${resp.status}`);
      (error as Record<string, unknown>).stripeType = errType;
      (error as Record<string, unknown>).statusCode = resp.status;
      throw error;
    }
    return (parsed ?? {}) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

async function getSecretKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("stripeApi");
  if (!cred) return "";
  const data = cred as Record<string, unknown>;
  return String(data.secretKey ?? data.apiKey ?? "");
}

function stripePath(resource: string, operation: string, params: Record<string, unknown>): string {
  if (resource === "balance") return "/balance";
  if (resource === "charge" && operation === "get") return `/charges/${params.chargeId ?? ""}`;
  if (resource === "charge" && operation === "getAll") return "/charges";
  if (resource === "charge") return "/charges";
  if (resource === "coupon" && operation === "getAll") return "/coupons";
  if (resource === "coupon") return "/coupons";
  if (resource === "customer" && operation === "get") return `/customers/${params.customerId ?? ""}`;
  if (resource === "customer" && operation === "delete") return `/customers/${params.customerId ?? ""}`;
  if (resource === "customer" && operation === "getAll") return "/customers";
  if (resource === "customer") return "/customers";
  if (resource === "customerCard" && operation === "get") return `/customers/${params.customerId ?? ""}/sources/${params.cardId ?? ""}`;
  if (resource === "customerCard" && operation === "remove") return `/customers/${params.customerId ?? ""}/sources/${params.cardId ?? ""}`;
  if (resource === "customerCard") return `/customers/${params.customerId ?? ""}/sources`;
  if (resource === "meterEvent") return "/meter_events";
  if (resource === "source" && operation === "get") return `/sources/${params.sourceId ?? ""}`;
  if (resource === "source" && operation === "delete") return `/sources/${params.sourceId ?? ""}`;
  if (resource === "source") return "/sources";
  if (resource === "token") return "/tokens";
  return `/${resource}s`;
}

function buildBody(
  resource: string,
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (resource === "charge" && operation === "create") {
    body.amount = toNum(params.amount, itemJson);
    body.currency = toVal(params.currency, itemJson);
    const source = toVal(params.source, itemJson);
    if (source) body.source = source;
  }

  if (resource === "charge" && operation === "update") {
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    if (additionalFields.description) body.description = toVal(additionalFields.description, itemJson);
    if (additionalFields.metadata) {
      try {
        body.metadata = JSON.parse(toVal(additionalFields.metadata, itemJson));
      } catch {
        body.metadata = toVal(additionalFields.metadata, itemJson);
      }
    }
  }

  if (resource === "coupon" && operation === "create") {
    body.duration = toVal(params.duration, itemJson);
    const percentOff = toNum(params.percentOff, itemJson);
    const amountOff = toNum(params.amountOff, itemJson);
    if (percentOff > 0) body.percent_off = percentOff;
    if (amountOff > 0) body.amount_off = amountOff;
  }

  if (resource === "customer" && operation === "create") {
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    if (additionalFields.email) body.email = toVal(additionalFields.email, itemJson);
    if (additionalFields.description) body.description = toVal(additionalFields.description, itemJson);
    if (additionalFields.name) body.name = toVal(additionalFields.name, itemJson);
    if (additionalFields.phone) body.phone = toVal(additionalFields.phone, itemJson);
    if (additionalFields.metadata) {
      try {
        body.metadata = JSON.parse(toVal(additionalFields.metadata, itemJson));
      } catch {
        body.metadata = toVal(additionalFields.metadata, itemJson);
      }
    }
  }

  if (resource === "customer" && operation === "update") {
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    if (additionalFields.email) body.email = toVal(additionalFields.email, itemJson);
    if (additionalFields.description) body.description = toVal(additionalFields.description, itemJson);
    if (additionalFields.name) body.name = toVal(additionalFields.name, itemJson);
    if (additionalFields.phone) body.phone = toVal(additionalFields.phone, itemJson);
    if (additionalFields.metadata) {
      try {
        body.metadata = JSON.parse(toVal(additionalFields.metadata, itemJson));
      } catch {
        body.metadata = toVal(additionalFields.metadata, itemJson);
      }
    }
  }

  if (resource === "customerCard" && operation === "add") {
    const source = toVal(params.source, itemJson);
    if (source) body.source = source;
  }

  if (resource === "meterEvent" && operation === "create") {
    body.event_name = toVal(params.eventName, itemJson);
    body.value = toNum(params.value, itemJson);
    const ts = toNum(params.timestamp, itemJson);
    if (ts > 0) body.timestamp = ts;
  }

  if (resource === "source" && operation === "create") {
    body.type = toVal(params.sourceType, itemJson);
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    if (additionalFields.metadata) {
      try {
        body.metadata = JSON.parse(toVal(additionalFields.metadata, itemJson));
      } catch {
        body.metadata = toVal(additionalFields.metadata, itemJson);
      }
    }
  }

  if (resource === "token" && operation === "create") {
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
    const tokenType = String(resolveValue(params.tokenType, itemJson) ?? "")
      || String(resolveValue(additionalFields.tokenType, itemJson) ?? "")
      || "card";
    if (tokenType === "card") {
      body.card = {};
      const card = (additionalFields.card ?? {}) as Record<string, unknown>;
      if (card.number) (body.card as Record<string, unknown>).number = card.number;
      if (card.expMonth) (body.card as Record<string, unknown>).exp_month = card.expMonth;
      if (card.expYear) (body.card as Record<string, unknown>).exp_year = card.expYear;
      if (card.cvc) (body.card as Record<string, unknown>).cvc = card.cvc;
    } else {
      body.bank_account = {};
    }
  }

  return body;
}

function buildQueryParams(
  resource: string,
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, string> | undefined {
  if (operation !== "getAll") return undefined;

  const qp: Record<string, string> = {};
  const limit = toNum(params.limit, itemJson);
  if (limit > 0) qp.limit = String(limit);

  if (resource === "customer") {
    const email = toVal(params.email, itemJson);
    if (email) qp.email = email;
  }

  return Object.keys(qp).length > 0 ? qp : undefined;
}

function methodFor(resource: string, operation: string): string {
  if (operation === "get" || operation === "getAll") return "GET";
  if (operation === "delete" || operation === "remove") return "DELETE";
  return "POST";
}

export const stripeExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail?.() ?? false;

  const secretKey = await getSecretKey(ctx);
  if (!secretKey) {
    if (!continueOnFail) throw new Error("Stripe: secretKey is required");
    for (let i = 0; i < items.length; i++) {
      out.push({ json: { error: "Stripe: secretKey is required" }, pairedItem: { item: i, input: 0 } });
    }
    return [out];
  }

  const auth = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: i, input: 0 };

    try {
      const resource = String(resolveValue(node.parameters.resource, itemJson) ?? "balance");
      const operation = String(resolveValue(node.parameters.operation, itemJson) ?? "get");
      const params = (node.parameters ?? {}) as Record<string, unknown>;

      const path = stripePath(resource, operation, params);
      const body = buildBody(resource, operation, params, itemJson);
      const qp = buildQueryParams(resource, operation, params, itemJson);
      const method = methodFor(resource, operation);

      const url = qp ? `${API_BASE}${path}?${new URLSearchParams(qp).toString()}` : `${API_BASE}${path}`;

      const headers: Record<string, string> = {
        Authorization: auth,
        "Content-Type": "application/x-www-form-urlencoded",
      };

      let result: Record<string, unknown>;

      if (method === "GET") {
        result = await stripeFetch(url, { method: "GET", headers });
      } else if (method === "DELETE") {
        result = await stripeFetch(url, { method: "DELETE", headers });
      } else {
        const formBody = buildFormBody(body);
        result = await stripeFetch(url, {
          method: "POST",
          headers: { ...headers },
          body: formBody.toString(),
        });
      }

      // For list operations, wrap in a container
      if (operation === "getAll" && Array.isArray(result.data)) {
        out.push({ json: result as unknown as Record<string, unknown>, pairedItem });
      } else {
        out.push({ json: result, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const stripeType = err instanceof Error ? (err as Record<string, unknown>).stripeType as string : "";
      out.push({
        json: { error: { message: msg, type: stripeType || "unknown" } },
        pairedItem,
      });
    }
  }
  return [out];
};