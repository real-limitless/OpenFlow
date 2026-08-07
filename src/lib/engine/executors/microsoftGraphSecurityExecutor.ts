import type { NodeExecutor, INodeExecutionData, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://graph.microsoft.com/v1.0/security";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      if (key === "$filter") {
        searchParams.set("$filter", value);
      } else {
        searchParams.set(key, value);
      }
    }
  }
  const qs = searchParams.toString();
  return qs ? `${base}?${qs}` : base;
}

async function graphRequest(
  url: string,
  accessToken: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  const init: RequestInit = { method, headers };

  if (body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {}
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Microsoft Graph request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const error = obj.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : null;
  const code = error ? error.code : undefined;
  const message = error ? error.message : obj.message;
  return new Error(
    `Microsoft Graph Security: ${typeof message === "string" ? message : `HTTP ${status}`}${code ? ` (code: ${code})` : ""}`,
  );
}

async function requestOk(url: string, accessToken: string, method = "GET", body?: unknown): Promise<Record<string, unknown>> {
  const res = await graphRequest(url, accessToken, method, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status);
  return asObj(res.body);
}

function getToken(cred: unknown): string {
  if (!cred) throw new Error("Microsoft Graph Security: microsoftGraphSecurityOAuth2Api credential is not configured");
  const c = cred as Record<string, unknown>;
  return String(c.accessToken ?? c.token ?? "");
}

export const microsoftGraphSecurityExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters as Record<string, unknown>;
  const resource = String(params.resource ?? "secureScore");
  const operation = String(params.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("microsoftGraphSecurityOAuth2Api");
  const accessToken = getToken(cred);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: Record<string, unknown>;
      const baseUrl = cred
        ? String((cred as Record<string, unknown>).baseUrl ?? API_BASE)
        : API_BASE;

      if (resource === "secureScore") {
        if (operation === "get") {
          const secureScoreId = String(params.secureScoreId ?? "");
          if (!secureScoreId) throw new Error("Microsoft Graph Security: secureScoreId is required for Get operation");
          result = await requestOk(`${baseUrl}/secureScores/${secureScoreId}`, accessToken);
        } else if (operation === "getAll") {
          const returnAll = Boolean(params.returnAll ?? false);
          const limit = Number(params.limit ?? 50);
          const filters = (params.filters as Record<string, unknown>) ?? {};
          const filterStr = filters.filter ? String(filters.filter) : undefined;
          const includeControlScores = Boolean(filters.includeControlScores);

          const qp: Record<string, string | undefined> = {};
          if (filterStr) qp["$filter"] = filterStr;
          if (includeControlScores || !returnAll) {
            qp["$count"] = "true";
          }

          let url = buildUrl(`${baseUrl}/secureScores`, qp);
          let accumulated: unknown[] = [];

          const fetchPage = async (pageUrl: string): Promise<void> => {
            const pageResult = await requestOk(pageUrl, accessToken);
            const value = Array.isArray(pageResult.value) ? (pageResult.value as unknown[]) : [];
            const nextLink = pageResult["@odata.nextLink"];

            if (!returnAll) {
              const remaining = limit - accumulated.length;
              if (remaining <= 0) return;
              accumulated = accumulated.concat(value.slice(0, remaining));
            } else {
              accumulated = accumulated.concat(value);
            }

            if (returnAll && nextLink && typeof nextLink === "string") {
              await fetchPage(nextLink);
            }
          };

          await fetchPage(url);
          if (!returnAll && accumulated.length > limit) {
            accumulated = accumulated.slice(0, limit);
          }

          out.push({ json: { value: accumulated }, pairedItem });
          continue;
        } else {
          throw new Error(`Microsoft Graph Security: unsupported operation "${operation}" for secureScore`);
        }
      } else if (resource === "secureScoreControlProfile") {
        if (operation === "get") {
          const profileId = String(params.secureScoreControlProfileId ?? "");
          if (!profileId) throw new Error("Microsoft Graph Security: secureScoreControlProfileId is required for Get operation");
          result = await requestOk(`${baseUrl}/secureScoreControlProfiles/${profileId}`, accessToken);
        } else if (operation === "getAll") {
          const returnAll = Boolean(params.returnAll ?? false);
          const limit = Number(params.limit ?? 50);
          const filters = (params.filters as Record<string, unknown>) ?? {};
          const filterStr = filters.filter ? String(filters.filter) : undefined;

          const qp: Record<string, string | undefined> = {};
          if (filterStr) qp["$filter"] = filterStr;

          let url = buildUrl(`${baseUrl}/secureScoreControlProfiles`, qp);
          let accumulated: unknown[] = [];

          const fetchPage = async (pageUrl: string): Promise<void> => {
            const pageResult = await requestOk(pageUrl, accessToken);
            const value = Array.isArray(pageResult.value) ? (pageResult.value as unknown[]) : [];
            const nextLink = pageResult["@odata.nextLink"];

            if (!returnAll) {
              const remaining = limit - accumulated.length;
              if (remaining <= 0) return;
              accumulated = accumulated.concat(value.slice(0, remaining));
            } else {
              accumulated = accumulated.concat(value);
            }

            if (returnAll && nextLink && typeof nextLink === "string") {
              await fetchPage(nextLink);
            }
          };

          await fetchPage(url);
          if (!returnAll && accumulated.length > limit) {
            accumulated = accumulated.slice(0, limit);
          }

          out.push({ json: { value: accumulated }, pairedItem });
          continue;
        } else if (operation === "update") {
          const profileId = String(params.secureScoreControlProfileId ?? "");
          const provider = String(params.provider ?? "");
          const vendor = String(params.vendor ?? "");
          const updateFields = (params.updateFields as Record<string, unknown>) ?? {};
          const state = String(updateFields.state ?? "Default");

          if (!profileId) throw new Error("Microsoft Graph Security: secureScoreControlProfileId is required for Update operation");
          if (!provider) throw new Error("Microsoft Graph Security: provider is required for Update operation");
          if (!vendor) throw new Error("Microsoft Graph Security: vendor is required for Update operation");

          const body = {
            vendorInformation: { provider, vendor },
            state,
          };
          result = await requestOk(
            `${baseUrl}/secureScoreControlProfiles/${profileId}`,
            accessToken,
            "PATCH",
            body,
          );
        } else {
          throw new Error(`Microsoft Graph Security: unsupported operation "${operation}" for secureScoreControlProfile`);
        }
      } else {
        throw new Error(`Microsoft Graph Security: unsupported resource "${resource}"`);
      }

      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
