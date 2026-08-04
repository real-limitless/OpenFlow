import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v17/customers";

const CAMPAIGN_SELECT_FIELDS = [
  "campaign.id",
  "campaign.name",
  "campaign.status",
  "campaign.campaign_budget",
  "campaign.campaign_group",
  "campaign.advertising_channel_type",
  "campaign.advertising_channel_sub_type",
  "campaign.start_date",
  "campaign.end_date",
  "campaign_budget.amount_micros",
  "campaign.bidding_strategy_type",
  "campaign.serving_status",
  "campaign.labels",
  "campaign.optimization_score",
];

function selectFields(resource: string): string[] {
  if (resource === "campaign") return CAMPAIGN_SELECT_FIELDS;
  return CAMPAIGN_SELECT_FIELDS;
}

function buildGaql(
  resource: string,
  customerId: string,
  campaignId: string,
  filters: Record<string, unknown> | undefined,
): string {
  const fields = selectFields(resource);
  const conditions: string[] = [];
  conditions.push(`${resource}.status != 'UNKNOWN'`);
  if (campaignId) {
    conditions.push(`${resource}.id = ${campaignId.replace(/[^0-9]/g, "")}`);
  }
  if (filters && typeof filters === "object") {
    for (const [key, val] of Object.entries(filters)) {
      if (val !== undefined && val !== null && val !== "") {
        conditions.push(`${key} = ${String(val)}`);
      }
    }
  }
  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  return `SELECT ${fields.join(", ")} FROM ${resource}${whereClause} ORDER BY ${resource}.id LIMIT 500`;
}

async function getAccessToken(
  ctx: ExecutionContext,
  node: INode,
): Promise<{ accessToken: string; developerToken: string }> {
  const cred = await ctx.getCredential("googleAdsOAuth2Api");
  if (!cred) {
    throw new Error("Google Ads: googleAdsOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("Google Ads: credential has no accessToken");
  }
  const developerToken = String(cred.developerToken ?? cred.developer_token ?? "");
  return { accessToken, developerToken };
}

async function searchCampaigns(
  customerId: string,
  gaql: string,
  accessToken: string,
  developerToken: string,
): Promise<Record<string, unknown>[]> {
  const cleanCustomerId = customerId.replace(/-/g, "");
  const url = `${GOOGLE_ADS_API}/${cleanCustomerId}/googleAds:search`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
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

function toOutputShape(results: Record<string, unknown>[], resource: string): Record<string, unknown>[] {
  return results.map((row) => {
    const inner = (row[resource] ?? row) as Record<string, unknown>;
    return { [resource]: inner };
  });
}

export const googleAdsToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "campaign");
  const operation = String(node.parameters.operation ?? "getAll");
  const customerId = String(node.parameters.customerId ?? "");
  const campaignId = String(node.parameters.campaignId ?? "");
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const filters = node.parameters.filters as Record<string, unknown> | undefined;
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      if (!customerId) throw new Error("Google Ads: customerId is required");
      if (operation === "get" && !campaignId) {
        throw new Error("Google Ads: campaignId is required for get operation");
      }
      const { accessToken, developerToken } = await getAccessToken(ctx, node);
      const effectiveCampaignId = operation === "get" ? campaignId : "";
      const gaql = buildGaql(resource, customerId, effectiveCampaignId, filters);
      const rawResults = await searchCampaigns(customerId, gaql, accessToken, developerToken);

      if (operation === "get") {
        if (rawResults.length === 0) {
          throw new Error(`Google Ads: campaign ${campaignId} not found`);
        }
        const inner = (rawResults[0][resource] ?? rawResults[0]) as Record<string, unknown>;
        out.push({ json: { campaign: inner }, pairedItem });
      } else {
        let results = rawResults;
        if (!returnAll && results.length > limit) {
          results = results.slice(0, limit);
        }
        const campaigns = results.map((row) => {
          return (row[resource] ?? row) as Record<string, unknown>;
        });
        out.push({ json: { campaigns }, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
