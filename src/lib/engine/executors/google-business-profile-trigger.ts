import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const API_BASE = "https://mybusiness.googleapis.com/v4";

async function getAccessToken(ctx: {
  getCredential(name: string): Promise<unknown>;
}): Promise<string> {
  const cred = (await ctx.getCredential("googleBusinessProfileOAuth2Api")) as
    | { accessToken?: string; access_token?: string }
    | null;
  if (!cred) {
    throw new Error(
      "GoogleBusinessProfileTrigger: googleBusinessProfileOAuth2Api credential is not configured",
    );
  }
  const token = String(cred.accessToken ?? cred.access_token ?? "");
  if (!token) {
    throw new Error(
      "GoogleBusinessProfileTrigger: credential has no accessToken",
    );
  }
  return token;
}

async function apiGet(
  url: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  return { status: res.status, body: parsed };
}

/** Per-test: clear in-memory static data. */
const staticDataStore = new Map<string, Record<string, unknown>>();

export function _clearStaticDataForTest(): void {
  staticDataStore.clear();
}

function getStaticData(nodeId: string): Record<string, unknown> {
  let data = staticDataStore.get(nodeId);
  if (!data) {
    data = {};
    staticDataStore.set(nodeId, data);
  }
  return data;
}

/**
 * Fetches all locations for the authenticated account.
 * Returns an array of location name strings like "accounts/{id}/locations/{id}".
 */
async function fetchAllLocationNames(
  token: string,
): Promise<string[]> {
  const accountsUrl = `${API_BASE}/accounts`;
  const accountsRes = await apiGet(accountsUrl, token);
  const accountsBody = (accountsRes.body as Record<string, unknown>) ?? {};
  const accounts = (accountsBody.accounts as Record<string, unknown>[]) ?? [];

  if (accounts.length === 0) {
    throw new Error("GoogleBusinessProfileTrigger: no Google Business Profile accounts found");
  }

  const locationNames: string[] = [];
  for (const account of accounts) {
    const accountName = String(account.name ?? "");
    if (!accountName) continue;
    const locsUrl = `${API_BASE}/${accountName}/locations?pageSize=100`;
    const locsRes = await apiGet(locsUrl, token);
    const locsBody = (locsRes.body as Record<string, unknown>) ?? {};
    const locations = (locsBody.locations as Record<string, unknown>[]) ?? [];
    for (const loc of locations) {
      const locName = String(loc.name ?? "");
      if (locName) locationNames.push(locName);
    }
  }
  return locationNames;
}

async function fetchAllReviews(
  token: string,
  locationNames: string[],
): Promise<Record<string, unknown>[]> {
  const allReviews: Record<string, unknown>[] = [];
  for (const locName of locationNames) {
    const url = `${API_BASE}/${locName}/reviews?pageSize=100`;
    const res = await apiGet(url, token);
    const body = (res.body as Record<string, unknown>) ?? {};
    if (res.status >= 400) {
      const errObj = body.error as Record<string, unknown> | undefined;
      const msg = String(errObj?.message ?? `HTTP ${res.status}`);
      throw new Error(`GoogleBusinessProfileTrigger: ${msg}`);
    }
    const reviews = (body.reviews as Record<string, unknown>[]) ?? [];
    for (const r of reviews) {
      allReviews.push({ ...r, locationName: locName });
    }
  }
  return allReviews;
}

export const googleBusinessProfileTriggerExecutor: NodeExecutor = async (
  ctx,
) => {
  const token = await getAccessToken(ctx);
  const event = String(ctx.getParam("event", "reviewAdded"));

  const nodeId = ctx.node.id ?? "default";
  const staticData = getStaticData(nodeId);

  if (ctx.getWorkflow()?.active !== true) {
    const locationNames = await fetchAllLocationNames(token);
    const allReviews = await fetchAllReviews(token, locationNames);
    allReviews.sort(
      (a, b) =>
        new Date(String(b.createTime ?? "")).getTime() -
        new Date(String(a.createTime ?? "")).getTime(),
    );
    if (allReviews.length === 0) {
      throw new Error("GoogleBusinessProfileTrigger: no matching review found");
    }
    return [[{ json: allReviews[0] as INodeExecutionData["json"] }]];
  }

  const lastPollTime = staticData.lastPollTime as string | undefined;

  if (!lastPollTime) {
    const locationNames = await fetchAllLocationNames(token);
    const allReviews = await fetchAllReviews(token, locationNames);
    const seenIds = allReviews.map((r) => String(r.reviewId ?? r.name ?? "")).filter(Boolean);
    staticData.lastPollTime = new Date().toISOString();
    staticData.seenReviewIds = seenIds;
    staticData._activated = true;
    return [[]];
  }

  const locationNames = await fetchAllLocationNames(token);
  const allReviews = await fetchAllReviews(token, locationNames);

  const seenIds = new Set<string>(
    (staticData.seenReviewIds as string[]) ?? [],
  );
  const newReviews: Record<string, unknown>[] = [];

  for (const r of allReviews) {
    const reviewId = String(r.reviewId ?? r.name ?? "");
    if (!reviewId || seenIds.has(reviewId)) continue;
    seenIds.add(reviewId);
    newReviews.push(r);
  }

  staticData.lastPollTime = new Date().toISOString();
  staticData.seenReviewIds = Array.from(seenIds);

  if (newReviews.length === 0) return [[]];

  return [newReviews.map((r) => ({ json: r as INodeExecutionData["json"] }))];
};
