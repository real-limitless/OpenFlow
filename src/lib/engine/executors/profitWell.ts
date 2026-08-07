import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, withPairedItem } from "@/sdk";

const API_BASE = "https://api.profitwell.com";

export const profitWellExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "company");
  const operation = String(node.parameters.operation ?? "getSettings");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getApiToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("profitWellApi");
  const token = cred ? String(cred.apiToken ?? "") : "";
  if (!token) {
    throw new Error("ProfitWell: profitWellApi credential is not configured");
  }
  return token;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (resource === "company") {
    return runCompanyOperation(ctx, node, operation, itemJson);
  }
  if (resource === "metric") {
    return runMetricOperation(ctx, node, operation, itemJson);
  }
  throw new Error(`ProfitWell: unsupported resource "${resource}"`);
}

async function runCompanyOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation === "getSettings") {
    const token = await getApiToken(ctx);
    return profitWellRequest(token, "GET", "/v2/company/settings/");
  }
  throw new Error(`ProfitWell: unsupported company operation "${operation}"`);
}

async function runMetricOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation === "daily") {
    const token = await getApiToken(ctx);
    const month = String(node.parameters.month ?? "");
    if (!month) throw new Error("ProfitWell: month is required for daily metrics");

    const qs = new URLSearchParams();
    qs.set("month", month);

    const planId = node.parameters.planId;
    if (planId && String(planId).trim()) {
      qs.set("plan_id", String(planId));
    }

    const metrics = node.parameters.metrics;
    if (metrics && String(metrics).trim()) {
      qs.set("metrics", String(metrics));
    }

    const url = `/v2/metrics/daily/?${qs.toString()}`;
    return profitWellRequest(token, "GET", url);
  }
  throw new Error(`ProfitWell: unsupported metric operation "${operation}"`);
}

async function profitWellRequest(
  token: string,
  method: string,
  path: string,
): Promise<Record<string, unknown>> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    };
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      const errMsg =
        String(body.message ?? body.error ?? body.detail ?? `HTTP ${response.status}`);
      const error = new Error(errMsg);
      (error as Record<string, unknown>).statusCode = response.status;
      throw error;
    }
    return (parsed as Record<string, unknown>) ?? {};
  } finally {
    clearTimeout(timer);
  }
}
