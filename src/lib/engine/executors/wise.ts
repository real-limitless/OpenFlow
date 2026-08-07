import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { sdkHttpRequest, withPairedItem, ensureItems } from "@/sdk";

const LIVE_API = "https://api.wise.com";
const SANDBOX_API = "https://api.sandbox.transferwise.tech";

function getBaseUrl(env: string): string {
  return env === "test" ? SANDBOX_API : LIVE_API;
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const expr = raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1");
      const fn = new Function("$json", "return " + expr);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("wiseApi");
  if (!cred) throw new Error("wiseApi credential is required");
  const data = cred as Record<string, unknown>;
  const apiToken = String(data.apiToken ?? "");
  if (!apiToken) throw new Error("API token is required in wiseApi credential");
  return { Authorization: `Bearer ${apiToken}` };
}

function getEnvironment(ctx: ExecutionContext): string {
  const cred = ctx.getCredential("wiseApi");
  return "live";
}

async function operationProfile(
  ctx: ExecutionContext,
  op: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const headers = await getAuthHeaders(ctx);
  const baseUrl = LIVE_API;

  if (op === "getAll") {
    const res = await sdkHttpRequest({ url: `${baseUrl}/v1/profiles`, headers });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    const profiles = Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
    return profiles;
  }

  if (op === "get") {
    const profileId = str(resolveValue(params.profileId, itemJson));
    if (!profileId) throw new Error("profileId is required for profile get");
    const res = await sdkHttpRequest({ url: `${baseUrl}/v1/profiles/${profileId}`, headers });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return res.body as Record<string, unknown>;
  }

  throw new Error(`Unknown profile operation: ${op}`);
}

async function operationAccount(
  ctx: ExecutionContext,
  op: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const headers = await getAuthHeaders(ctx);
  const baseUrl = LIVE_API;
  const profileId = str(resolveValue(params.profileId, itemJson));
  if (!profileId) throw new Error("profileId is required for account operations");

  if (op === "getBalances") {
    const res = await sdkHttpRequest({ url: `${baseUrl}/v1/profiles/${profileId}/balances?types=STANDARD`, headers });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
  }

  if (op === "getCurrencies") {
    const res = await sdkHttpRequest({ url: `${baseUrl}/v1/profiles/${profileId}/balances?types=STANDARD`, headers });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    const balances = Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
    return balances.map((b) => ({ currency: b.currency }));
  }

  if (op === "getStatement") {
    const currency = str(resolveValue(params.currency, itemJson));
    const url = currency
      ? `${baseUrl}/v1/profiles/${profileId}/statement/${currency}`
      : `${baseUrl}/v1/profiles/${profileId}/statement`;
    const res = await sdkHttpRequest({ url, headers });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return res.body as Record<string, unknown>;
  }

  throw new Error(`Unknown account operation: ${op}`);
}

async function operationExchangeRate(
  ctx: ExecutionContext,
  _op: string,
  params: Record<string, unknown>,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers = await getAuthHeaders(ctx);
  const baseUrl = LIVE_API;
  const source = str(params.source);
  const target = str(params.target);
  if (!source || !target) throw new Error("source and target currencies are required");
  let url = `${baseUrl}/v1/rates?source=${source}&target=${target}`;
  const interval = str(params.interval);
  if (interval) url += `&interval=${interval}`;
  const res = await sdkHttpRequest({ url, headers });
  if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
  const rates = Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
  if (rates.length === 0) throw new Error("No exchange rate data returned");
  return rates[0];
}

async function operationRecipient(
  ctx: ExecutionContext,
  _op: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const headers = await getAuthHeaders(ctx);
  const baseUrl = LIVE_API;
  const profileId = str(resolveValue(params.profileId, itemJson));
  if (!profileId) throw new Error("profileId is required for recipient operations");
  const res = await sdkHttpRequest({ url: `${baseUrl}/v1/accounts?profileId=${profileId}`, headers });
  if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
  return Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
}

async function operationQuote(
  ctx: ExecutionContext,
  op: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers = await getAuthHeaders(ctx);
  const baseUrl = LIVE_API;

  if (op === "create") {
    const profileId = num(resolveValue(params.profileId, itemJson));
    const sourceCurrency = str(params.sourceCurrency);
    const targetCurrency = str(params.targetCurrency);
    const amount = num(params.amount);
    if (!profileId) throw new Error("profileId is required for quote create");
    if (!sourceCurrency || !targetCurrency) throw new Error("sourceCurrency and targetCurrency are required");
    if (amount <= 0) throw new Error("amount must be positive");
    const res = await sdkHttpRequest({
      method: "POST",
      url: `${baseUrl}/v2/profiles/${profileId}/quotes`,
      headers: { ...headers, "content-type": "application/json" },
      body: { sourceCurrency, targetCurrency, sourceAmount: amount },
    });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return res.body as Record<string, unknown>;
  }

  if (op === "get") {
    const profileId = str(resolveValue(params.profileId, itemJson));
    const quoteId = str(params.quoteId);
    if (!profileId) throw new Error("profileId is required for quote get");
    if (!quoteId) throw new Error("quoteId is required for quote get");
    const res = await sdkHttpRequest({ url: `${baseUrl}/v2/quotes/${quoteId}`, headers });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return res.body as Record<string, unknown>;
  }

  throw new Error(`Unknown quote operation: ${op}`);
}

async function operationTransfer(
  ctx: ExecutionContext,
  op: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const headers = await getAuthHeaders(ctx);
  const baseUrl = LIVE_API;

  if (op === "create") {
    const profileId = num(resolveValue(params.profileId, itemJson));
    const quoteId = str(params.quoteId);
    const targetAccount = num(resolveValue(params.targetAccount, itemJson));
    const reference = str(params.reference);
    if (!profileId) throw new Error("profileId is required for transfer create");
    if (!quoteId) throw new Error("quoteId is required for transfer create");
    if (!targetAccount) throw new Error("targetAccount is required for transfer create");
    const body: Record<string, unknown> = {
      targetAccount,
      quoteUuid: quoteId,
      customerTransactionId: crypto.randomUUID(),
    };
    if (reference) body.details = { reference };
    const res = await sdkHttpRequest({
      method: "POST",
      url: `${baseUrl}/v1/profiles/${profileId}/transfers`,
      headers: { ...headers, "content-type": "application/json" },
      body,
    });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return res.body as Record<string, unknown>;
  }

  if (op === "delete") {
    const transferId = num(resolveValue(params.transferId, itemJson));
    if (!transferId) throw new Error("transferId is required for transfer delete");
    const res = await sdkHttpRequest({
      method: "DELETE",
      url: `${baseUrl}/v1/transfers/${transferId}`,
      headers,
    });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return { success: true, transferId };
  }

  if (op === "execute") {
    const transferId = num(resolveValue(params.transferId, itemJson));
    if (!transferId) throw new Error("transferId is required for transfer execute");
    const res = await sdkHttpRequest({
      method: "POST",
      url: `${baseUrl}/v1/transfers/${transferId}/payments`,
      headers: { ...headers, "content-type": "application/json" },
      body: { type: "BALANCE" },
    });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return res.body as Record<string, unknown>;
  }

  if (op === "get") {
    const transferId = num(resolveValue(params.transferId, itemJson));
    if (!transferId) throw new Error("transferId is required for transfer get");
    const res = await sdkHttpRequest({ url: `${baseUrl}/v1/transfers/${transferId}`, headers });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return res.body as Record<string, unknown>;
  }

  if (op === "getAll") {
    const profileId = num(resolveValue(params.profileId, itemJson));
    if (!profileId) throw new Error("profileId is required for transfer getAll");
    let url = `${baseUrl}/v1/profiles/${profileId}/transfers`;
    const parts: string[] = [];
    const sourceCurrency = str(resolveValue(params.sourceCurrency, itemJson));
    if (sourceCurrency) parts.push(`sourceCurrency=${sourceCurrency}`);
    const status = str(resolveValue(params.status, itemJson));
    if (status) parts.push(`status=${status}`);
    if (parts.length > 0) url += `?${parts.join("&")}`;
    const res = await sdkHttpRequest({ url, headers });
    if (res.status >= 400) throw new Error(`Wise API error: ${JSON.stringify(res.body)}`);
    return Array.isArray(res.body) ? (res.body as Record<string, unknown>[]) : [];
  }

  throw new Error(`Unknown transfer operation: ${op}`);
}

export const wiseExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "profile");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: unknown;
      switch (resource) {
        case "profile":
          result = await operationProfile(ctx, operation, node.parameters, itemJson);
          break;
        case "account":
          result = await operationAccount(ctx, operation, node.parameters, itemJson);
          break;
        case "exchangeRate":
          result = await operationExchangeRate(ctx, operation, node.parameters, itemJson);
          break;
        case "recipient":
          result = await operationRecipient(ctx, operation, node.parameters, itemJson);
          break;
        case "quote":
          result = await operationQuote(ctx, operation, node.parameters, itemJson);
          break;
        case "transfer":
          result = await operationTransfer(ctx, operation, node.parameters, itemJson);
          break;
        default:
          throw new Error(`Unknown resource: ${resource}`);
      }
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r as Record<string, unknown>, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};
