import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const API_BASE = "https://api.profitwell.com";

export const profitWellToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "company");
  const operation = ctx.getParam<string>("operation", "getSetting");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("profitWellApi");
  const token = cred ? String(cred.apiToken ?? "") : "";
  if (!token) {
    throw new Error("ProfitWellTool: profitWellApi credential is not configured");
  }

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: Record<string, unknown>;

      if (resource === "company" && operation === "getSetting") {
        result = await apiRequest(token, "GET", "/v2/company/settings/");
      } else if (resource === "metric" && operation === "get") {
        result = await getMetric(token, ctx);
      } else {
        throw new Error(`ProfitWellTool: unsupported resource "${resource}" / operation "${operation}"`);
      }

      out.push({
        json: result,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

async function getMetric(
  token: string,
  ctx: { getParam: <T = unknown>(name: string, defaultValue?: T) => T },
): Promise<Record<string, unknown>> {
  const type = ctx.getParam<string>("type", "daily");
  const month = ctx.getParam<string>("month", "");
  const simple = ctx.getParam<boolean>("simple", true);
  const options = ctx.getParam<Record<string, unknown>>("options", {});

  if (type === "daily" && !month) {
    throw new Error("ProfitWellTool: month is required for daily metrics");
  }

  const qs = new URLSearchParams();
  if (month) qs.set("month", month);

  const planId = options?.plan_id;
  if (planId && String(planId).trim()) {
    qs.set("plan_id", String(planId));
  }

  const metrics = type === "daily"
    ? (options?.dailyMetrics as string[] | undefined)
    : (options?.monthlyMetrics as string[] | undefined);
  if (metrics && Array.isArray(metrics) && metrics.length > 0) {
    qs.set("metrics", metrics.join(","));
  }

  const endpoint = type === "monthly" ? "/v2/metrics/monthly/" : "/v2/metrics/daily/";
  const qsString = qs.toString();
  const url = qsString ? `${endpoint}?${qsString}` : endpoint;
  const raw = await apiRequest(token, "GET", url);

  if (simple) {
    return simplifyMetricResponse(raw, type);
  }
  return raw;
}

function simplifyMetricResponse(
  raw: Record<string, unknown>,
  type: string,
): Record<string, unknown> {
  if (type === "monthly") {
    return raw;
  }
  if (raw && typeof raw === "object" && "data" in raw) {
    return { data: raw.data };
  }
  return raw;
}

async function apiRequest(
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