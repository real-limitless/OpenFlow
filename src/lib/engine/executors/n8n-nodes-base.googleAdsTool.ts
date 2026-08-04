import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v18";

export const googleAdsToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "campaign");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("googleAdsOAuth2Api");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("Google Ads: googleAdsOAuth2Api credential is not configured");
  }
  return accessToken;
}

function getOptions(node: INode): Record<string, unknown> {
  return (node.parameters.options ?? {}) as Record<string, unknown>;
}

function resolveCustomerId(node: INode): { customerId: string; loginCustomerId: string } {
  const managerCustomerId = String(node.parameters.managerCustomerId ?? "").replace(/-/g, "");
  const clientCustomerId = String(node.parameters.clientCustomerId ?? "").replace(/-/g, "");

  if (!managerCustomerId && !clientCustomerId) {
    throw new Error("Google Ads: customer ID is required");
  }

  const customerId = clientCustomerId || managerCustomerId;
  const loginCustomerId = managerCustomerId && clientCustomerId ? managerCustomerId : customerId;

  return { customerId, loginCustomerId };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  _itemJson: Record<string, unknown>,
): Promise<Array<Record<string, unknown>> | Record<string, unknown>> {
  const token = await getToken(ctx);

  if (resource === "campaign") {
    if (operation === "getAll") {
      return getAllCampaigns(token, node);
    }
    if (operation === "get") {
      return getCampaign(token, node);
    }
    throw new Error(`Google Ads: unsupported campaign operation "${operation}"`);
  }

  throw new Error(`Google Ads: unsupported resource "${resource}"`);
}

function buildGaqlQuery(node: INode): string {
  const fields = [
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "campaign.campaign_budget",
    "campaign.campaign_group",
    "campaign.start_date",
    "campaign.end_date",
    "campaign.serving_status",
    "campaign.advertising_channel_type",
    "campaign.advertising_channel_sub_type",
  ];
  const clauses: string[] = [];
  const status = String(node.parameters.campaignStatus ?? "all");
  if (status !== "all") {
    clauses.push(`campaign.status = '${status}'`);
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  return `SELECT ${fields.join(", ")} FROM campaign${where}`;
}

function buildGaqlGetQuery(node: INode): string {
  const campaignId = String(node.parameters.campaignId ?? "");
  const fields = [
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "campaign.campaign_budget",
    "campaign.campaign_group",
    "campaign.start_date",
    "campaign.end_date",
    "campaign.serving_status",
    "campaign.advertising_channel_type",
    "campaign.advertising_channel_sub_type",
  ];
  return `SELECT ${fields.join(", ")} FROM campaign WHERE campaign.id = ${campaignId}`;
}

function mapCampaignRow(row: Record<string, unknown>): Record<string, unknown> {
  const campaign = (row.campaign ?? row) as Record<string, unknown> | undefined;
  if (!campaign) {
    return {
      id: String(row.resourceName ?? "").split("/").pop() ?? "",
      name: "",
      status: "",
      campaignBudget: null,
      campaignGroup: null,
      startDate: "",
      endDate: "",
      servingStatus: "",
      advertisingChannelType: "",
      advertisingChannelSubType: "",
    };
  }
  return {
    id: String(campaign.id ?? ""),
    name: String(campaign.name ?? ""),
    status: String(campaign.status ?? ""),
    campaignBudget: campaign.campaignBudget ?? null,
    campaignGroup: campaign.campaignGroup ?? null,
    startDate: String(campaign.startDate ?? ""),
    endDate: String(campaign.endDate ?? ""),
    servingStatus: String(campaign.servingStatus ?? ""),
    advertisingChannelType: String(campaign.advertisingChannelType ?? ""),
    advertisingChannelSubType: String(campaign.advertisingChannelSubType ?? ""),
  };
}

async function getAllCampaigns(
  token: string,
  node: INode,
): Promise<Array<Record<string, unknown>>> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const { customerId, loginCustomerId } = resolveCustomerId(node);
  const gaql = buildGaqlQuery(node);

  const body: Record<string, unknown> = { query: gaql };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "developer-token": "",
    "login-customer-id": loginCustomerId,
  };

  const timeout = Number(getOptions(node).timeout ?? 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }

    if (response.status < 200 || response.status >= 300) {
      const obj = (parsed ?? {}) as Record<string, unknown>;
      const errMsg = obj.message
        ? String(obj.message)
        : (obj.error as Record<string, unknown> | undefined)?.message
          ? String((obj.error as Record<string, unknown>).message)
          : `Google Ads API request failed with status ${response.status}`;
      throw new Error(errMsg);
    }

    const data = (parsed ?? {}) as Record<string, unknown>;
    const results = (data.results ?? []) as Array<Record<string, unknown>>;
    const filtered = returnAll ? results : results.slice(0, limit);
    const campaigns = filtered.map(mapCampaignRow);

    return [{ campaigns }];
  } finally {
    clearTimeout(timer);
  }
}

async function getCampaign(
  token: string,
  node: INode,
): Promise<Record<string, unknown>> {
  const campaignId = String(node.parameters.campaignId ?? "");
  if (!campaignId) {
    throw new Error("Google Ads: campaign ID is required");
  }

  const { customerId, loginCustomerId } = resolveCustomerId(node);
  const gaql = buildGaqlGetQuery(node);

  const body: Record<string, unknown> = { query: gaql };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "developer-token": "",
    "login-customer-id": loginCustomerId,
  };

  const timeout = Number(getOptions(node).timeout ?? 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }

    if (response.status < 200 || response.status >= 300) {
      const obj = (parsed ?? {}) as Record<string, unknown>;
      const errMsg = obj.message
        ? String(obj.message)
        : (obj.error as Record<string, unknown> | undefined)?.message
          ? String((obj.error as Record<string, unknown>).message)
          : `Google Ads API request failed with status ${response.status}`;
      throw new Error(errMsg);
    }

    const data = (parsed ?? {}) as Record<string, unknown>;
    const results = (data.results ?? []) as Array<Record<string, unknown>>;
    if (results.length === 0) {
      throw new Error(`Google Ads: campaign with ID "${campaignId}" not found`);
    }

    return { campaign: mapCampaignRow(results[0]) };
  } finally {
    clearTimeout(timer);
  }
}
