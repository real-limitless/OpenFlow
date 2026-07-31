import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://graph.microsoft.com/v1.0";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function buildUrl(endpoint: string): string {
  return `${API_BASE}${endpoint}`;
}

async function apiCall(
  method: string,
  endpoint: string,
  credential: Record<string, unknown> | null,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const token = credential?.accessToken ?? credential?.access_token;
  if (!token) throw new Error("Microsoft Entra: no access token in credential");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${String(token)}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(buildUrl(endpoint), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.text();
    let parsed: { message?: string; code?: string } = { message: errBody };
    try {
      parsed = JSON.parse(errBody);
    } catch {}
    throw new Error(
      `Microsoft Entra API error (${res.status}): ${parsed.message ?? parsed.code ?? errBody}`,
    );
  }

  if (res.status === 204) return {};
  const json = await res.json();
  if (json && typeof json === "object") return json as Record<string, unknown>;
  return {};
}

function buildGroupBody(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const displayName = resolveValue(params.displayName, itemJson);
  if (displayName) body.displayName = displayName;

  const mailEnabled = resolveValue(params.mailEnabled, itemJson);
  if (mailEnabled != null) body.mailEnabled = Boolean(mailEnabled);

  const mailNickname = resolveValue(params.mailNickname, itemJson);
  if (mailNickname) body.mailNickname = mailNickname;

  const securityEnabled = resolveValue(params.securityEnabled, itemJson);
  if (securityEnabled != null) body.securityEnabled = Boolean(securityEnabled);

  const groupTypes = resolveValue(params.groupTypes, itemJson);
  if (groupTypes) body.groupTypes = groupTypes;

  const visibility = resolveValue(params.visibility, itemJson);
  if (visibility) body.visibility = visibility;

  const af = resolveValue(params.additionalFields, itemJson) as Record<string, unknown> | undefined;
  if (af && typeof af === "object") {
    for (const [k, v] of Object.entries(af)) {
      if (v !== "" && v != null) body[k] = v;
    }
  }

  return body;
}

function buildUserBody(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const accountEnabled = resolveValue(params.accountEnabled, itemJson);
  if (accountEnabled != null) body.accountEnabled = Boolean(accountEnabled);

  const displayName = resolveValue(params.displayName, itemJson);
  if (displayName) body.displayName = displayName;

  const mailNickname = resolveValue(params.mailNickname, itemJson);
  if (mailNickname) body.mailNickname = mailNickname;

  const userPrincipalName = resolveValue(params.userPrincipalName, itemJson);
  if (userPrincipalName) body.userPrincipalName = userPrincipalName;

  const pp = resolveValue(params.passwordProfile, itemJson) as Record<string, unknown> | undefined;
  if (pp && typeof pp === "object") {
    const ppv = (pp.passwordProfileValues ?? pp) as Record<string, unknown> | undefined;
    if (ppv) {
      const pw: Record<string, unknown> = {};
      if (ppv.password) pw.password = ppv.password;
      if (ppv.forceChangePasswordNextSignIn != null)
        pw.forceChangePasswordNextSignIn = Boolean(ppv.forceChangePasswordNextSignIn);
      if (Object.keys(pw).length > 0) body.passwordProfile = pw;
    }
  }

  const af = resolveValue(params.additionalFields, itemJson) as Record<string, unknown> | undefined;
  if (af && typeof af === "object") {
    for (const [k, v] of Object.entries(af)) {
      if (v !== "" && v != null) body[k] = v;
    }
  }

  return body;
}

export const microsoftEntraExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters ?? {};
  const resource = String(params.resource ?? "group");
  const operation = String(params.operation ?? "getAll");
  const credential = await ctx.getCredential("microsoftEntraOAuth2Api");

  if (operation === "getAll") {
    const returnAll = params.returnAll === true;
    const limit = Number(params.limit ?? 50);
    const filters = (params.filters as Record<string, unknown>) ?? {};

    const itemJson = items[0]?.json ?? {};
    const query = resolveValue(filters.query, itemJson as Record<string, unknown>) as
      string | undefined;

    let endpoint: string;
    if (resource === "group") {
      endpoint = "/groups";
    } else {
      endpoint = "/users";
    }

    if (query) {
      endpoint += `?$filter=${encodeURIComponent(query)}`;
    }

    const result = await apiCall("GET", endpoint, credential);
    const values = (result.value as Array<Record<string, unknown>>) ?? [];

    const sliced = returnAll ? values : values.slice(0, limit);
    out.push(...sliced.map((v) => ({ json: v })));
    return [out];
  }

  for (const item of items) {
    const itemJson = item.json ?? {};

    try {
      if (resource === "group") {
        const groupId = resolveValue(params.groupId, itemJson) as string | undefined;

        switch (operation) {
          case "create": {
            const body = buildGroupBody(params, itemJson);
            const result = await apiCall("POST", "/groups", credential, body);
            out.push({ json: result });
            break;
          }
          case "delete": {
            await apiCall("DELETE", `/groups/${groupId}`, credential);
            out.push({ json: itemJson });
            break;
          }
          case "get": {
            const result = await apiCall("GET", `/groups/${groupId}`, credential);
            out.push({ json: result });
            break;
          }
          case "update": {
            const body = buildGroupBody(params, itemJson);
            await apiCall("PATCH", `/groups/${groupId}`, credential, body);
            const result = await apiCall("GET", `/groups/${groupId}`, credential);
            out.push({ json: result });
            break;
          }
          default:
            out.push({ json: itemJson });
        }
      } else if (resource === "user") {
        const userId = resolveValue(params.userId, itemJson) as string | undefined;
        const groupId = resolveValue(params.groupId, itemJson) as string | undefined;

        switch (operation) {
          case "create": {
            const body = buildUserBody(params, itemJson);
            const result = await apiCall("POST", "/users", credential, body);
            out.push({ json: result });
            break;
          }
          case "delete": {
            await apiCall("DELETE", `/users/${userId}`, credential);
            out.push({ json: itemJson });
            break;
          }
          case "get": {
            const result = await apiCall("GET", `/users/${userId}`, credential);
            out.push({ json: result });
            break;
          }
          case "update": {
            const body = buildUserBody(params, itemJson);
            await apiCall("PATCH", `/users/${userId}`, credential, body);
            const result = await apiCall("GET", `/users/${userId}`, credential);
            out.push({ json: result });
            break;
          }
          case "addToGroup": {
            const odataId = `${API_BASE}/directoryObjects/${userId}`;
            await apiCall("POST", `/groups/${groupId}/members/$ref`, credential, {
              "@odata.id": odataId,
            });
            out.push({ json: itemJson });
            break;
          }
          case "removeFromGroup": {
            await apiCall("DELETE", `/groups/${groupId}/members/${userId}/$ref`, credential);
            out.push({ json: itemJson });
            break;
          }
          default:
            out.push({ json: itemJson });
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
        });
      } else {
        throw e;
      }
    }
  }

  return [out];
};
