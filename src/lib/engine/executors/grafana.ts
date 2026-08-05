import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { sdkHttpRequest } from "@/sdk";
import { evaluateOnItem } from "@/sdk/helpers/expressions";

function resolveExpressions(value: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof value !== "string") return value;
  if (value.startsWith("=") || value.includes("{{")) {
    return evaluateOnItem(value, itemJson);
  }
  return value;
}

export const grafanaExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();
  const resource = String(node.parameters.resource ?? "dashboard");
  const operation = String(node.parameters.operation ?? "create");
  const isGetAll = operation === "getAll";

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      if (isGetAll) {
        out.push({ json: result as Record<string, unknown>, pairedItem });
      } else {
        const list = Array.isArray(result) ? result : [result];
        for (const r of list) {
          out.push({ json: r, pairedItem });
        }
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof Error && "status" in err ? (err as any).status : 500;
      out.push({ json: { error: { message, statusCode } }, pairedItem });
    }
  }

  return [out];
};

async function getAuthHeaders(ctx: ExecutionContext): Promise<{ headers: Record<string, string>; baseUrl: string }> {
  const cred = await ctx.getCredential("grafanaApi");
  if (!cred) {
    throw new Error("Grafana: grafanaApi credential is not configured");
  }
  const apiKey = String(cred.apiKey ?? "");
  if (!apiKey) {
    throw new Error("Grafana: apiKey is required in grafanaApi credential");
  }
  const baseUrl = String(cred.baseUrl ?? "").replace(/\/+$/, "");
  return {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    baseUrl,
  };
}

async function apiCall(opts: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}) {
  const res = await sdkHttpRequest({
    method: opts.method,
    url: opts.url,
    headers: opts.headers,
    body: opts.body,
  });
  if (res.status < 200 || res.status >= 300) {
    const msg =
      typeof res.body === "object" && res.body !== null && "message" in (res.body as any)
        ? (res.body as any).message
        : `Grafana API returned ${res.status}`;
    throw Object.assign(new Error(String(msg)), { status: res.status });
  }
  return res.body;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const { headers, baseUrl } = await getAuthHeaders(ctx);

  switch (resource) {
    case "dashboard":
      return handleDashboard(ctx, node, headers, baseUrl, operation, itemJson);

    case "team":
      return handleTeam(ctx, node, headers, baseUrl, operation, itemJson);

    case "teamMember":
      return handleTeamMember(ctx, node, headers, baseUrl, operation, itemJson);

    case "user":
      return handleUser(ctx, node, headers, baseUrl, operation, itemJson);

    default:
      throw new Error(`Grafana: unsupported resource "${resource}"`);
  }
}

async function handleDashboard(
  ctx: ExecutionContext,
  node: INode,
  headers: Record<string, string>,
  base: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (operation) {
    case "create": {
      const title = String(resolveExpressions(node.parameters.title, itemJson) ?? "");
      if (!title) throw new Error("Grafana: title is required for dashboard create");
      const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = {
        dashboard: { title },
        overwrite: false,
      };
      const folderId = resolveExpressions(additionalFields.folderId, itemJson);
      if (folderId && String(folderId) !== "") {
        body.folderId = Number(folderId);
      }
      return apiCall({
        method: "POST",
        url: `${base}/api/dashboards/db`,
        headers,
        body,
      }) as Promise<Record<string, unknown>>;
    }

    case "delete": {
      const uid = String(resolveExpressions(node.parameters.dashboardUidOrUrl, itemJson) ?? "");
      if (!uid) throw new Error("Grafana: dashboardUidOrUrl is required for dashboard delete");
      return apiCall({
        method: "DELETE",
        url: `${base}/api/dashboards/uid/${encodeURIComponent(uid)}`,
        headers,
      }) as Promise<Record<string, unknown>>;
    }

    case "get": {
      const uid = String(resolveExpressions(node.parameters.dashboardUidOrUrl, itemJson) ?? "");
      if (!uid) throw new Error("Grafana: dashboardUidOrUrl is required for dashboard get");
      return apiCall({
        method: "GET",
        url: `${base}/api/dashboards/uid/${encodeURIComponent(uid)}`,
        headers,
      }) as Promise<Record<string, unknown>>;
    }

    case "getAll": {
      const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
      const limit = Number(node.parameters.limit ?? 50);
      const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
      const query = String(resolveExpressions(filters.query, itemJson) ?? "");
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      params.set("limit", String(returnAll ? 5000 : limit));
      const res = await sdkHttpRequest({
        method: "GET",
        url: `${base}/api/search?${params.toString()}`,
        headers,
      });
      const data = Array.isArray(res.body)
        ? (res.body as Record<string, unknown>[])
        : [];
      return returnAll ? data : data.slice(0, limit);
    }

    case "update": {
      const uid = String(resolveExpressions(node.parameters.dashboardUidOrUrl, itemJson) ?? "");
      if (!uid) throw new Error("Grafana: dashboardUidOrUrl is required for dashboard update");
      const updateFields = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
      const newTitle = String(resolveExpressions(updateFields.title, itemJson) ?? "");
      const newFolderId = resolveExpressions(updateFields.folderId, itemJson);

      const body: Record<string, unknown> = {
        dashboard: { uid, title: newTitle || undefined },
        overwrite: true,
      };
      if (newFolderId && String(newFolderId) !== "") {
        body.folderId = Number(newFolderId);
      }
      return apiCall({
        method: "POST",
        url: `${base}/api/dashboards/db`,
        headers,
        body,
      }) as Promise<Record<string, unknown>>;
    }

    default:
      throw new Error(`Grafana: unsupported dashboard operation "${operation}"`);
  }
}

async function handleTeam(
  ctx: ExecutionContext,
  node: INode,
  headers: Record<string, string>,
  base: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (operation) {
    case "create": {
      const name = String(resolveExpressions(node.parameters.name, itemJson) ?? "");
      if (!name) throw new Error("Grafana: name is required for team create");
      const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = { name };
      const email = resolveExpressions(additionalFields.email, itemJson);
      if (email && String(email) !== "") body.email = email;
      return apiCall({
        method: "POST",
        url: `${base}/api/teams`,
        headers,
        body,
      }) as Promise<Record<string, unknown>>;
    }

    case "delete": {
      const teamId = String(resolveExpressions(node.parameters.teamId, itemJson) ?? "");
      if (!teamId) throw new Error("Grafana: teamId is required for team delete");
      return apiCall({
        method: "DELETE",
        url: `${base}/api/teams/${encodeURIComponent(teamId)}`,
        headers,
      }) as Promise<Record<string, unknown>>;
    }

    case "get": {
      const teamId = String(resolveExpressions(node.parameters.teamId, itemJson) ?? "");
      if (!teamId) throw new Error("Grafana: teamId is required for team get");
      return apiCall({
        method: "GET",
        url: `${base}/api/teams/${encodeURIComponent(teamId)}`,
        headers,
      }) as Promise<Record<string, unknown>>;
    }

    case "getAll": {
      const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
      const limit = Number(node.parameters.limit ?? 50);
      const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
      const nameFilter = String(resolveExpressions(filters.name, itemJson) ?? "");
      const params = new URLSearchParams();
      if (nameFilter) params.set("name", nameFilter);
      params.set("perpage", String(returnAll ? 5000 : limit));
      const res = await sdkHttpRequest({
        method: "GET",
        url: `${base}/api/teams/search?${params.toString()}`,
        headers,
      });
      const body = res.body as Record<string, unknown> ?? {};
      const teams = Array.isArray(body.teams) ? (body.teams as Record<string, unknown>[]) : [];
      return returnAll ? teams : teams.slice(0, limit);
    }

    case "update": {
      const teamId = String(resolveExpressions(node.parameters.teamId, itemJson) ?? "");
      if (!teamId) throw new Error("Grafana: teamId is required for team update");
      const updateFields = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = {};
      const newName = resolveExpressions(updateFields.name, itemJson);
      if (newName && String(newName) !== "") body.name = newName;
      const newEmail = resolveExpressions(updateFields.email, itemJson);
      if (newEmail && String(newEmail) !== "") body.email = newEmail;
      return apiCall({
        method: "PUT",
        url: `${base}/api/teams/${encodeURIComponent(teamId)}`,
        headers,
        body,
      }) as Promise<Record<string, unknown>>;
    }

    default:
      throw new Error(`Grafana: unsupported team operation "${operation}"`);
  }
}

async function handleTeamMember(
  ctx: ExecutionContext,
  node: INode,
  headers: Record<string, string>,
  base: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (operation) {
    case "add": {
      const userId = String(resolveExpressions(node.parameters.userId, itemJson) ?? "");
      const teamId = String(resolveExpressions(node.parameters.teamId, itemJson) ?? "");
      if (!userId || !teamId) throw new Error("Grafana: userId and teamId are required for team member add");
      return apiCall({
        method: "POST",
        url: `${base}/api/teams/${encodeURIComponent(teamId)}/members`,
        headers,
        body: { userId: Number(userId) },
      }) as Promise<Record<string, unknown>>;
    }

    case "getAll": {
      const teamId = String(resolveExpressions(node.parameters.teamId, itemJson) ?? "");
      if (!teamId) throw new Error("Grafana: teamId is required for team member getAll");
      const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
      const limit = Number(node.parameters.limit ?? 50);
      const res = await sdkHttpRequest({
        method: "GET",
        url: `${base}/api/teams/${encodeURIComponent(teamId)}/members`,
        headers,
      });
      const data = Array.isArray(res.body)
        ? (res.body as Record<string, unknown>[])
        : [];
      return returnAll ? data : data.slice(0, limit);
    }

    case "remove": {
      const memberId = String(resolveExpressions(node.parameters.memberId, itemJson) ?? "");
      const teamId = String(resolveExpressions(node.parameters.teamId, itemJson) ?? "");
      if (!memberId || !teamId) throw new Error("Grafana: memberId and teamId are required for team member remove");
      return apiCall({
        method: "DELETE",
        url: `${base}/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`,
        headers,
      }) as Promise<Record<string, unknown>>;
    }

    default:
      throw new Error(`Grafana: unsupported teamMember operation "${operation}"`);
  }
}

async function handleUser(
  ctx: ExecutionContext,
  node: INode,
  headers: Record<string, string>,
  base: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (operation) {
    case "delete": {
      const userId = String(resolveExpressions(node.parameters.userId, itemJson) ?? "");
      if (!userId) throw new Error("Grafana: userId is required for user delete");
      return apiCall({
        method: "DELETE",
        url: `${base}/api/org/users/${encodeURIComponent(userId)}`,
        headers,
      }) as Promise<Record<string, unknown>>;
    }

    case "getAll": {
      const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
      const limit = Number(node.parameters.limit ?? 50);
      const res = await sdkHttpRequest({
        method: "GET",
        url: `${base}/api/org/users`,
        headers,
      });
      const data = Array.isArray(res.body)
        ? (res.body as Record<string, unknown>[])
        : [];
      return returnAll ? data : data.slice(0, limit);
    }

    case "update": {
      const userId = String(resolveExpressions(node.parameters.userId, itemJson) ?? "");
      if (!userId) throw new Error("Grafana: userId is required for user update");
      const updateFields = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = {};
      const role = resolveExpressions(updateFields.role, itemJson);
      if (role && String(role) !== "") body.role = String(role);
      return apiCall({
        method: "PATCH",
        url: `${base}/api/org/users/${encodeURIComponent(userId)}`,
        headers,
        body,
      }) as Promise<Record<string, unknown>>;
    }

    default:
      throw new Error(`Grafana: unsupported user operation "${operation}"`);
  }
}
