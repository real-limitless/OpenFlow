import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

const DIRECTORY_API = "https://admin.googleapis.com/admin/directory/v1";

function resolveValue(param: unknown): unknown {
  if (typeof param === "string" && (param.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(param))) {
    return param;
  }
  return param;
}

function resolveLocator(raw: unknown): string {
  const resolved = resolveValue(raw);
  if (typeof resolved === "string") return resolved;
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "");
  }
  return String(resolved ?? "");
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("gSuiteAdminOAuth2Api");
  if (!cred) {
    throw new Error("gSuiteAdminTool: gSuiteAdminOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("gSuiteAdminTool: credential has no accessToken");
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
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
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`gSuiteAdminTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function simplifyUser(user: Record<string, unknown>): Record<string, unknown> {
  const name = user.name as Record<string, unknown> | undefined;
  return {
    kind: user.kind ?? "admin#directory#user",
    id: user.id,
    primaryEmail: user.primaryEmail,
    name: {
      familyName: name?.familyName,
      fullName: name?.fullName,
      givenName: name?.givenName,
    },
    isAdmin: user.isAdmin ?? false,
    lastLoginTime: user.lastLoginTime,
    creationTime: user.creationTime,
    suspended: user.suspended ?? false,
  };
}

async function userCreate(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const firstName = String(resolveValue(params.firstName) ?? "");
  const lastName = String(resolveValue(params.lastName) ?? "");
  const password = String(resolveValue(params.password) ?? "");
  const username = String(resolveValue(params.username) ?? "");
  const domain = String(resolveValue(params.domain) ?? "");

  if (!firstName || !lastName || !password || !domain) {
    throw new Error("gSuiteAdminTool: firstName, lastName, password and domain are required");
  }
  const primaryEmail = username ? `${username}@${domain}` : domain;

  const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {
    name: { givenName: firstName, familyName: lastName },
    password,
    primaryEmail,
  };
  if (additionalFields.changePasswordAtNextLogin === true) {
    body.changePasswordAtNextLogin = true;
  }

  const { body: resp } = await apiRequest("POST", `${DIRECTORY_API}/users`, token, body);
  return simplifyUser(asObj(resp));
}

async function userGet(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const userId = resolveLocator(params.userId);
  if (!userId) throw new Error("gSuiteAdminTool: userId is required");
  const projection = String(resolveValue(params.projection) ?? "basic");
  const qs = buildQueryString({ projection });
  const { body: resp } = await apiRequest("GET", `${DIRECTORY_API}/users/${encodeURIComponent(userId)}${qs}`, token);
  const user = asObj(resp);
  const output = String(resolveValue(params.output) ?? "simplified");
  if (output === "simplified") return simplifyUser(user);
  return user;
}

async function userGetAll(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const returnAll = params.returnAll === true;
  const limit = Number(resolveValue(params.limit) ?? 100);
  const filter = (params.filter ?? {}) as Record<string, unknown>;
  const sort = (params.sort ?? {}) as Record<string, unknown>;
  const projection = String(resolveValue(params.projection) ?? "basic");

  const qParams: Record<string, string | number | boolean | undefined> = {
    projection,
    customer: filter.customer as string | undefined,
    domain: filter.domain as string | undefined,
    query: filter.query as string | undefined,
    showDeleted: filter.showDeleted === true ? true : undefined,
    orderBy: sort.orderBy as string | undefined,
    sortOrder: sort.sortOrder as string | undefined,
    maxResults: returnAll ? 500 : limit,
  };
  const { body: resp } = await apiRequest("GET", `${DIRECTORY_API}/users${buildQueryString(qParams)}`, token);
  const users = ((resp as { users?: unknown }).users ?? []) as Array<Record<string, unknown>>;
  const output = String(resolveValue(params.output) ?? "simplified");
  const results = output === "simplified" ? users.map(simplifyUser) : users;
  const limited = returnAll ? results : results.slice(0, limit);
  return { users: limited, totalResults: limited.length };
}

async function userDelete(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const userId = resolveLocator(params.userId);
  if (!userId) throw new Error("gSuiteAdminTool: userId is required");
  await apiRequest("DELETE", `${DIRECTORY_API}/users/${encodeURIComponent(userId)}`, token);
  return { deleted: true };
}

async function userUpdate(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const userId = resolveLocator(params.userId);
  if (!userId) throw new Error("gSuiteAdminTool: userId is required");
  const fields = (params.updateFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  if (fields.firstName !== undefined || fields.lastName !== undefined) {
    const name: Record<string, unknown> = {};
    if (fields.firstName !== undefined) name.givenName = resolveValue(fields.firstName);
    if (fields.lastName !== undefined) name.familyName = resolveValue(fields.lastName);
    body.name = name;
  }
  if (fields.password !== undefined) body.password = resolveValue(fields.password);
  if (fields.changePasswordAtNextLogin !== undefined) {
    body.changePasswordAtNextLogin = fields.changePasswordAtNextLogin === true;
  }
  if (fields.archived !== undefined) body.archived = fields.archived === true;
  if (Object.keys(body).length === 0) {
    throw new Error("gSuiteAdminTool: no update fields provided");
  }
  const { body: resp } = await apiRequest("PUT", `${DIRECTORY_API}/users/${encodeURIComponent(userId)}`, token, body);
  return asObj(resp);
}

async function groupCreate(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const email = String(resolveValue(params.email) ?? "");
  if (!email) throw new Error("gSuiteAdminTool: group email is required");
  const name = String(resolveValue(params.name) ?? "");
  const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = { email };
  if (name) body.name = name;
  if (additionalFields.description !== undefined) {
    body.description = resolveValue(additionalFields.description);
  }
  const { body: resp } = await apiRequest("POST", `${DIRECTORY_API}/groups`, token, body);
  return asObj(resp);
}

async function groupGet(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const groupId = resolveLocator(params.groupId);
  if (!groupId) throw new Error("gSuiteAdminTool: groupId is required");
  const { body: resp } = await apiRequest("GET", `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}`, token);
  return asObj(resp);
}

async function groupGetAll(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const returnAll = params.returnAll === true;
  const limit = Number(resolveValue(params.limit) ?? 100);
  const filter = (params.filter ?? {}) as Record<string, unknown>;
  const sort = (params.sort ?? {}) as Record<string, unknown>;

  const qParams: Record<string, string | number | boolean | undefined> = {
    customer: filter.customer as string | undefined,
    domain: filter.domain as string | undefined,
    query: filter.query as string | undefined,
    userId: filter.userId as string | undefined,
    orderBy: sort.orderBy as string | undefined,
    sortOrder: sort.sortOrder as string | undefined,
    maxResults: returnAll ? 500 : limit,
  };
  const { body: resp } = await apiRequest("GET", `${DIRECTORY_API}/groups${buildQueryString(qParams)}`, token);
  const groups = ((resp as { groups?: unknown }).groups ?? []) as Array<Record<string, unknown>>;
  const limited = returnAll ? groups : groups.slice(0, limit);
  return { groups: limited, totalResults: limited.length };
}

async function groupDelete(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const groupId = resolveLocator(params.groupId);
  if (!groupId) throw new Error("gSuiteAdminTool: groupId is required");
  await apiRequest("DELETE", `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}`, token);
  return { deleted: true };
}

async function groupUpdate(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const groupId = resolveLocator(params.groupId);
  if (!groupId) throw new Error("gSuiteAdminTool: groupId is required");
  const fields = (params.updateFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  for (const key of ["description", "email", "name"] as const) {
    if (fields[key] !== undefined && fields[key] !== "") {
      body[key] = resolveValue(fields[key]);
    }
  }
  if (Object.keys(body).length === 0) {
    throw new Error("gSuiteAdminTool: no update fields provided");
  }
  const { body: resp } = await apiRequest("PUT", `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}`, token, body);
  return asObj(resp);
}

async function deviceGet(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const deviceId = resolveLocator(params.deviceId);
  if (!deviceId) throw new Error("gSuiteAdminTool: deviceId is required");
  const { body: resp } = await apiRequest(
    "GET",
    `${DIRECTORY_API}/customer/my_customer/devices/chromeos/${encodeURIComponent(deviceId)}`,
    token,
  );
  return asObj(resp);
}

async function deviceGetAll(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const returnAll = params.returnAll === true;
  const limit = Number(resolveValue(params.limit) ?? 100);
  const projection = String(resolveValue(params.projection) ?? "basic");
  const includeChildOrgunits = params.includeChildOrgunits === true;
  const filter = (params.filter ?? {}) as Record<string, unknown>;
  const sort = (params.sort ?? {}) as Record<string, unknown>;

  const qParams: Record<string, string | number | boolean | undefined> = {
    projection,
    includeChildOrgunits: includeChildOrgunits ? true : undefined,
    orgUnitPath: filter.orgUnitPath as string | undefined,
    query: filter.query as string | undefined,
    orderBy: sort.orderBy as string | undefined,
    sortOrder: sort.sortOrder as string | undefined,
    maxResults: returnAll ? 500 : limit,
  };
  const { body: resp } = await apiRequest(
    "GET",
    `${DIRECTORY_API}/customer/my_customer/devices/chromeos${buildQueryString(qParams)}`,
    token,
  );
  const devices = ((resp as { chromeosdevices?: unknown }).chromeosdevices ?? []) as Array<Record<string, unknown>>;
  const limited = returnAll ? devices : devices.slice(0, limit);
  return { chromeosdevices: limited, totalResults: limited.length };
}

async function deviceUpdate(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const deviceId = resolveLocator(params.deviceId);
  if (!deviceId) throw new Error("gSuiteAdminTool: deviceId is required");
  const options = (params.updateOptions ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  for (const key of ["orgUnitPath", "annotatedUser", "annotatedLocation", "annotatedAssetId", "notes"] as const) {
    if (options[key] !== undefined && options[key] !== "") {
      body[key] = resolveValue(options[key]);
    }
  }
  if (Object.keys(body).length === 0) {
    throw new Error("gSuiteAdminTool: no update options provided");
  }
  const { body: resp } = await apiRequest(
    "PUT",
    `${DIRECTORY_API}/customer/my_customer/devices/chromeos/${encodeURIComponent(deviceId)}`,
    token,
    body,
  );
  return asObj(resp);
}

async function deviceChangeStatus(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const deviceId = resolveLocator(params.deviceId);
  if (!deviceId) throw new Error("gSuiteAdminTool: deviceId is required");
  const action = String(resolveValue(params.action) ?? "disable");
  const actionValue = action === "reenable" ? "re-enable" : "disable";
  await apiRequest(
    "POST",
    `${DIRECTORY_API}/customer/my_customer/devices/chromeos/${encodeURIComponent(deviceId)}/action`,
    token,
    { action: actionValue },
  );
  return { deviceId, action: actionValue, status: "success" };
}

async function groupMembership(
  params: Record<string, unknown>,
  token: string,
  remove: boolean,
): Promise<Record<string, unknown>> {
  const userId = resolveLocator(params.userId);
  const groupId = resolveLocator(params.groupId);
  if (!userId || !groupId) {
    throw new Error("gSuiteAdminTool: userId and groupId are required");
  }
  if (remove) {
    await apiRequest(
      "DELETE",
      `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      token,
    );
    return { removed: true };
  }
  const { body: resp } = await apiRequest(
    "POST",
    `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}/members`,
    token,
    { email: userId, role: "MEMBER" },
  );
  return asObj(resp);
}

async function runOperation(
  ctx: ExecutionContext,
  nodeParams: Record<string, unknown>,
  resource: string,
  operation: string,
): Promise<Record<string, unknown>[]> {
  const token = await getAccessToken(ctx);

  if (resource === "user") {
    switch (operation) {
      case "create":
        return [await userCreate(nodeParams, token)];
      case "get":
        return [await userGet(nodeParams, token)];
      case "getAll":
        return [await userGetAll(nodeParams, token)];
      case "delete":
        return [await userDelete(nodeParams, token)];
      case "update":
        return [await userUpdate(nodeParams, token)];
      case "addToGroup":
        return [await groupMembership(nodeParams, token, false)];
      case "removeFromGroup":
        return [await groupMembership(nodeParams, token, true)];
      default:
        throw new Error(`gSuiteAdminTool: unsupported user operation "${operation}"`);
    }
  }

  if (resource === "group") {
    switch (operation) {
      case "create":
        return [await groupCreate(nodeParams, token)];
      case "get":
        return [await groupGet(nodeParams, token)];
      case "getAll":
        return [await groupGetAll(nodeParams, token)];
      case "delete":
        return [await groupDelete(nodeParams, token)];
      case "update":
        return [await groupUpdate(nodeParams, token)];
      default:
        throw new Error(`gSuiteAdminTool: unsupported group operation "${operation}"`);
    }
  }

  if (resource === "device") {
    switch (operation) {
      case "get":
        return [await deviceGet(nodeParams, token)];
      case "getAll":
        return [await deviceGetAll(nodeParams, token)];
      case "update":
        return [await deviceUpdate(nodeParams, token)];
      case "changeStatus":
        return [await deviceChangeStatus(nodeParams, token)];
      default:
        throw new Error(`gSuiteAdminTool: unsupported device operation "${operation}"`);
    }
  }

  throw new Error(`gSuiteAdminTool: unsupported resource "${resource}"`);
}

export const gSuiteAdminToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "user") ?? "user");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "getAll") ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(ctx, node.parameters as Record<string, unknown>, resource, operation);
      for (const json of results) {
        out.push({ json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
