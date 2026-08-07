import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://graph.microsoft.com/v1.0";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return raw;
  }
  return raw;
}

async function apiCall(
  method: string,
  url: string,
  accessToken: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.text();
    let parsed: { message?: string; error?: { message?: string } } = {};
    try {
      parsed = JSON.parse(errBody);
    } catch {}
    throw new Error(
      `Microsoft Entra ID API error (${res.status}): ${parsed.error?.message ?? parsed.message ?? errBody}`,
    );
  }

  if (res.status === 204) return null;
  return res.json();
}

function buildGroupBody(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const displayName = params.displayName;
  if (displayName) body.displayName = displayName;
  if (params.mailNickname) body.mailNickname = params.mailNickname;
  if (params.mailEnabled != null) body.mailEnabled = Boolean(params.mailEnabled);
  if (params.securityEnabled != null) body.securityEnabled = Boolean(params.securityEnabled);
  if (params.groupTypes) body.groupTypes = params.groupTypes;
  if (params.visibility) body.visibility = params.visibility;
  if (params.description) body.description = params.description;
  return body;
}

function buildUserBody(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (params.accountEnabled != null) body.accountEnabled = Boolean(params.accountEnabled);
  if (params.displayName) body.displayName = params.displayName;
  if (params.mailNickname) body.mailNickname = params.mailNickname;
  if (params.userPrincipalName) body.userPrincipalName = params.userPrincipalName;

  if (params.password) {
    body.passwordProfile = {
      password: params.password,
      forceChangePasswordNextSignIn: params.forceChangePassword === "nextSignIn" || params.forceChangePassword === "nextSignInWithMfa",
      forceChangePasswordNextSignInWithMfa: params.forceChangePassword === "nextSignInWithMfa",
    };
  }

  const af = params.additionalFields as Record<string, unknown> | undefined;
  if (af && typeof af === "object") {
    for (const [k, v] of Object.entries(af)) {
      if (v !== "" && v != null) body[k] = v;
    }
  }

  return body;
}

export const microsoftEntraToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters ?? {};
  const resource = String(params.resource ?? "user");
  const operation = String(params.operation ?? "getAll");
  const credential = await ctx.getCredential("microsoftOAuth2Api");

  if (!credential?.accessToken) {
    throw new Error("Microsoft Entra ID: microsoftOAuth2Api credential with access token required");
  }

  const token = String(credential.accessToken);

  for (const item of items) {
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: out.length, input: 0 };

    try {
      if (resource === "user") {
        const userId = typeof params.user === "object" && params.user !== null
          ? (params.user as Record<string, unknown>).value ?? (params.user as Record<string, unknown>).id
          : params.user;
        const groupId = typeof params.group === "object" && params.group !== null
          ? (params.group as Record<string, unknown>).value ?? (params.group as Record<string, unknown>).id
          : params.group;

        switch (operation) {
          case "create": {
            const body = buildUserBody(params);
            const result = await apiCall("POST", `${API_BASE}/users`, token, body) as Record<string, unknown>;
            out.push({ json: result, pairedItem });
            break;
          }
          case "get": {
            const result = await apiCall("GET", `${API_BASE}/users/${userId}`, token) as Record<string, unknown>;
            if (params.output === "simple" && result) {
              out.push({
                json: {
                  id: result.id,
                  displayName: result.displayName,
                  userPrincipalName: result.userPrincipalName,
                  mail: result.mail,
                  mailNickname: result.mailNickname,
                  securityIdentifier: result.securityIdentifier,
                  createdDateTime: result.createdDateTime,
                },
                pairedItem,
              });
            } else {
              out.push({ json: result as Record<string, unknown>, pairedItem });
            }
            break;
          }
          case "getAll": {
            const returnAll = params.returnAll === true;
            const limit = Number(params.limit ?? 50);
            let endpoint = `${API_BASE}/users`;
            const queryParams: string[] = [];
            if (params.filter) {
              queryParams.push(`$filter=${encodeURIComponent(String(params.filter))}`);
            }
            if (!returnAll) {
              queryParams.push(`$top=${limit}`);
            }
            if (params.output === "simple") {
              queryParams.push("$select=id,displayName,userPrincipalName,mail,mailNickname,securityIdentifier,createdDateTime");
            }
            if (queryParams.length > 0) {
              endpoint += "?" + queryParams.join("&");
            }
            const result = await apiCall("GET", endpoint, token) as Record<string, unknown>;
            const values = (result?.value as Array<Record<string, unknown>>) ?? [];
            const sliced = returnAll ? values : values.slice(0, limit);
            for (const v of sliced) {
              out.push({ json: v, pairedItem });
            }
            break;
          }
          case "update": {
            const body = buildUserBody(params);
            await apiCall("PATCH", `${API_BASE}/users/${userId}`, token, body);
            const updated = await apiCall("GET", `${API_BASE}/users/${userId}`, token) as Record<string, unknown>;
            out.push({ json: updated, pairedItem });
            break;
          }
          case "delete": {
            await apiCall("DELETE", `${API_BASE}/users/${userId}`, token);
            out.push({ json: itemJson, pairedItem });
            break;
          }
          case "addToGroup": {
            const odataId = `${API_BASE}/directoryObjects/${userId}`;
            await apiCall("POST", `${API_BASE}/groups/${groupId}/members/$ref`, token, {
              "@odata.id": odataId,
            });
            out.push({ json: itemJson, pairedItem });
            break;
          }
          case "removeFromGroup": {
            await apiCall("DELETE", `${API_BASE}/groups/${groupId}/members/${userId}/$ref`, token);
            out.push({ json: itemJson, pairedItem });
            break;
          }
          default:
            out.push({ json: itemJson, pairedItem });
        }
      } else if (resource === "group") {
        const groupId = typeof params.group === "object" && params.group !== null
          ? (params.group as Record<string, unknown>).value ?? (params.group as Record<string, unknown>).id
          : params.group;

        switch (operation) {
          case "create": {
            const body = buildGroupBody(params);
            const result = await apiCall("POST", `${API_BASE}/groups`, token, body) as Record<string, unknown>;
            out.push({ json: result, pairedItem });
            break;
          }
          case "get": {
            const result = await apiCall("GET", `${API_BASE}/groups/${groupId}`, token) as Record<string, unknown>;
            out.push({ json: result, pairedItem });
            break;
          }
          case "getAll": {
            const returnAll = params.returnAll === true;
            const limit = Number(params.limit ?? 50);
            let endpoint = `${API_BASE}/groups`;
            const queryParams: string[] = [];
            if (params.filter) {
              queryParams.push(`$filter=${encodeURIComponent(String(params.filter))}`);
            }
            if (!returnAll) {
              queryParams.push(`$top=${limit}`);
            }
            if (queryParams.length > 0) {
              endpoint += "?" + queryParams.join("&");
            }
            const result = await apiCall("GET", endpoint, token) as Record<string, unknown>;
            const values = (result?.value as Array<Record<string, unknown>>) ?? [];
            const sliced = returnAll ? values : values.slice(0, limit);
            for (const v of sliced) {
              out.push({ json: v, pairedItem });
            }
            break;
          }
          case "update": {
            const body = buildGroupBody(params);
            await apiCall("PATCH", `${API_BASE}/groups/${groupId}`, token, body);
            const updated = await apiCall("GET", `${API_BASE}/groups/${groupId}`, token) as Record<string, unknown>;
            out.push({ json: updated, pairedItem });
            break;
          }
          case "delete": {
            await apiCall("DELETE", `${API_BASE}/groups/${groupId}`, token);
            out.push({ json: itemJson, pairedItem });
            break;
          }
          default:
            out.push({ json: itemJson, pairedItem });
        }
      }
    } catch (e) {
      if (ctx.continueOnFail()) {
        out.push({
          json: {
            error: {
              message: e instanceof Error ? e.message : String(e),
              code: (e as { code?: string }).code ?? "UNKNOWN",
            },
          },
          pairedItem,
        });
      } else {
        throw e;
      }
    }
  }

  return [out];
};
