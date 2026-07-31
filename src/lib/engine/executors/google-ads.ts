import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v20/customers";

const SELECT_FIELDS = [
  "campaign.id",
  "campaign.name",
  "campaign_budget.amount_micros",
  "campaign_budget.period",
  "campaign.status",
  "campaign.optimization_score",
  "campaign.advertising_channel_type",
  "campaign.advertising_channel_sub_type",
  "metrics.impressions",
  "metrics.interactions",
  "metrics.interaction_rate",
  "metrics.average_cost",
  "metrics.cost_micros",
  "metrics.conversions",
  "metrics.cost_per_conversion",
  "metrics.conversions_from_interactions_rate",
  "metrics.video_views",
  "metrics.average_cpm",
  "metrics.ctr",
];

function buildGaql(operation: string, campaignId: string, additionalOptions: Record<string, unknown>): string {
  const conditions: string[] = [];
  conditions.push("campaign.status != 'UNKNOWN'");

  const status = String(additionalOptions.campaignStatus ?? "all");
  if (status !== "all") {
    conditions.push(`campaign.status = '${status}'`);
  }

  const dateRange = String(additionalOptions.dateRange ?? "allTime");
  if (dateRange !== "allTime") {
    conditions.push(`segments.date DURING ${dateRange}`);
  }

  if (operation === "get" && campaignId) {
    conditions.push(`campaign.id = ${campaignId.replace(/[^0-9]/g, "")}`);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  return `SELECT ${SELECT_FIELDS.join(", ")} FROM campaign${whereClause} ORDER BY campaign.id`;
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<{ accessToken: string; developerToken: string }> {
  const cred = await ctx.getCredential("googleAdsOAuth2Api");
  if (!cred) {
    throw new Error("Google Ads: googleAdsOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("Google Ads: credential has no accessToken");
  }
  const developerToken = String(cred.developerToken ?? cred.developer_token ?? "");
  if (!developerToken) {
    throw new Error("Google Ads: credential has no developerToken");
  }
  return { accessToken, developerToken };
}

async function searchCampaigns(
  customerId: string,
  managerCustomerId: string,
  gaql: string,
  token: string,
  developerToken: string,
): Promise<Record<string, unknown>[]> {
  const cleanCustomerId = customerId.replace(/-/g, "");
  const url = `${GOOGLE_ADS_API}/${cleanCustomerId}/googleAds:search`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    "login-customer-id": managerCustomerId.replace(/-/g, ""),
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: gaql }),
  });
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
    const errObj = (parsed as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    const msg = errObj?.message ?? String(parsed) ?? `HTTP ${res.status}`;
    throw new Error(`Google Ads: ${msg}`);
  }
  const body = parsed as { results?: Record<string, unknown>[] };
  return body.results ?? [];
}

export const googleAdsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "getAll") ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const clientCustomerId = String(node.parameters.clientCustomerId ?? ctx.getParam("clientCustomerId", "") ?? "");
      const managerCustomerId = String(node.parameters.managerCustomerId ?? ctx.getParam("managerCustomerId", "") ?? "");
      const campaignId = String(node.parameters.campaignId ?? ctx.getParam("campaignId", "") ?? "");
      const additionalOptions = (node.parameters.additionalOptions ?? ctx.getParam("additionalOptions", {}) ?? {}) as Record<string, unknown>;

      if (!clientCustomerId) throw new Error("Google Ads: clientCustomerId is required");
      if (!managerCustomerId) throw new Error("Google Ads: managerCustomerId is required");

      const { accessToken, developerToken } = await getAccessToken(ctx, node);
      const gaql = buildGaql(operation, campaignId, additionalOptions);
      const results = await searchCampaigns(clientCustomerId, managerCustomerId, gaql, accessToken, developerToken);

      for (const row of results) {
        out.push({ json: row, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};