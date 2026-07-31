import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const DIRECTORY_API = "https://admin.googleapis.com/admin/directory/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
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
    throw new Error("GSuiteAdmin: gSuiteAdminOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("GSuiteAdmin: credential has no accessToken");
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
    throw new Error(`GSuiteAdmin: ${msg}`);
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

function toCollection(
  raw: unknown,
  section: string,
): Record<string, unknown> {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const inner = section && obj[section];
    if (inner && typeof inner === "object") {
      return inner as Record<string, unknown>;
    }
    return obj;
  }
  return {};
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
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const firstName = String(resolveValue(node.parameters.firstName, itemJson) ?? "");
  const lastName = String(resolveValue(node.parameters.lastName, itemJson) ?? "");
  const password = String(resolveValue(node.parameters.password, itemJson) ?? "");
  const username = String(resolveValue(node.parameters.username, itemJson) ?? "");
  const domain = String(resolveValue(node.parameters.domain, itemJson) ?? "");

  if (!firstName || !lastName || !password || !domain) {
    throw new Error("GSuiteAdmin: firstName, lastName, password and domain are required");
  }
  const primaryEmail = username ? `${username}@${domain}` : domain;

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {
    name: { givenName: firstName, familyName: lastName },
    password,
    primaryEmail,
  };
  if (additionalFields.changePasswordAtNextLogin === true) {
    body.changePasswordAtNextLogin = true;
  }
  if (Array.isArray(additionalFields.roles) && additionalFields.roles.length > 0) {
    body.organizations = (additionalFields.roles as string[]).map((role) => ({
      title: role,
      primary: false,
    }));
  }

  const { body: resp } = await apiRequest("POST", `${DIRECTORY_API}/users`, token, body);
  return simplifyUser(asObj(resp));
}

async function userGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const userId = resolveLocator(node.parameters.userId, itemJson);
  if (!userId) throw new Error("GSuiteAdmin: userId is required");
  const projection = String(resolveValue(node.parameters.projection, itemJson) ?? "basic");
  const qs = buildQueryString({ projection });
  const { body: resp } = await apiRequest("GET", `${DIRECTORY_API}/users/${encodeURIComponent(userId)}${qs}`, token);
  const user = asObj(resp);
  const output = String(resolveValue(node.parameters.output, itemJson) ?? "simplified");
  if (output === "simplified") return simplifyUser(user);
  return user;
}

async function userGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 100);
  const filter = toCollection(node.parameters.filter, "");
  const sort = toCollection(node.parameters.sort, "sortValues");
  const projection = String(resolveValue(node.parameters.projection, itemJson) ?? "basic");

  const params: Record<string, string | number | boolean | undefined> = {
    projection,
    customer: resolveValue(filter.customer, itemJson) as string | undefined,
    domain: resolveValue(filter.domain, itemJson) as string | undefined,
    query: resolveValue(filter.query, itemJson) as string | undefined,
    showDeleted: filter.showDeleted === true ? true : undefined,
    orderBy: sort.orderBy as string | undefined,
    sortOrder: sort.sortOrder as string | undefined,
    maxResults: returnAll ? 500 : limit,
  };
  const { body: resp } = await apiRequest(
    "GET",
    `${DIRECTORY_API}/users${buildQueryString(params)}`,
    token,
  );
  const users = ((resp as { users?: unknown }).users ?? []) as Array<Record<string, unknown>>;
  const output = String(resolveValue(node.parameters.output, itemJson) ?? "simplified");
  const results = output === "simplified" ? users.map(simplifyUser) : users;
  const limited = returnAll ? results : results.slice(0, limit);
  return { users: limited, totalResults: limited.length };
}

async function userDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
  inputItem: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const userId = resolveLocator(node.parameters.userId, itemJson);
  if (!userId) throw new Error("GSuiteAdmin: userId is required");
  await apiRequest("DELETE", `${DIRECTORY_API}/users/${encodeURIComponent(userId)}`, token);
  return { ...inputItem.json, deleted: true };
}

async function userUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const userId = resolveLocator(node.parameters.userId, itemJson);
  if (!userId) throw new Error("GSuiteAdmin: userId is required");
  const fields = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  if (fields.firstName !== undefined || fields.lastName !== undefined) {
    const name = {} as Record<string, unknown>;
    if (fields.firstName !== undefined) name.givenName = resolveValue(fields.firstName, itemJson);
    if (fields.lastName !== undefined) name.familyName = resolveValue(fields.lastName, itemJson);
    body.name = name;
  }
  if (fields.password !== undefined) body.password = resolveValue(fields.password, itemJson);
  if (fields.changePasswordAtNextLogin !== undefined) {
    body.changePasswordAtNextLogin = fields.changePasswordAtNextLogin === true;
  }
  if (fields.archived !== undefined) body.archived = fields.archived === true;
  if (Object.keys(body).length === 0) {
    throw new Error("GSuiteAdmin: no update fields provided");
  }
  const { body: resp } = await apiRequest("PUT", `${DIRECTORY_API}/users/${encodeURIComponent(userId)}`, token, body);
  return asObj(resp);
}

async function groupCreate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!email) throw new Error("GSuiteAdmin: group email is required");
  const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = { email };
  if (name) body.name = name;
  if (additionalFields.description !== undefined) {
    body.description = resolveValue(additionalFields.description, itemJson);
  }
  const { body: resp } = await apiRequest("POST", `${DIRECTORY_API}/groups`, token, body);
  return asObj(resp);
}

async function groupGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const groupId = resolveLocator(node.parameters.groupId, itemJson);
  if (!groupId) throw new Error("GSuiteAdmin: groupId is required");
  const { body: resp } = await apiRequest("GET", `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}`, token);
  return asObj(resp);
}

async function groupGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 100);
  const filter = toCollection(node.parameters.filter, "");
  const sort = toCollection(node.parameters.sort, "sortValues");

  const params: Record<string, string | number | boolean | undefined> = {
    customer: resolveValue(filter.customer, itemJson) as string | undefined,
    domain: resolveValue(filter.domain, itemJson) as string | undefined,
    query: resolveValue(filter.query, itemJson) as string | undefined,
    userId: resolveValue(filter.userId, itemJson) as string | undefined,
    orderBy: sort.orderBy as string | undefined,
    sortOrder: sort.sortOrder as string | undefined,
    maxResults: returnAll ? 500 : limit,
  };
  const { body: resp } = await apiRequest(
    "GET",
    `${DIRECTORY_API}/groups${buildQueryString(params)}`,
    token,
  );
  const groups = ((resp as { groups?: unknown }).groups ?? []) as Array<Record<string, unknown>>;
  const limited = returnAll ? groups : groups.slice(0, limit);
  return { groups: limited, totalResults: limited.length };
}

async function groupDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
  inputItem: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const groupId = resolveLocator(node.parameters.groupId, itemJson);
  if (!groupId) throw new Error("GSuiteAdmin: groupId is required");
  await apiRequest("DELETE", `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}`, token);
  return { ...inputItem.json, deleted: true };
}

async function groupUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const groupId = resolveLocator(node.parameters.groupId, itemJson);
  if (!groupId) throw new Error("GSuiteAdmin: groupId is required");
  const fields = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  for (const key of ["description", "email", "name"] as const) {
    if (fields[key] !== undefined && fields[key] !== "") {
      body[key] = resolveValue(fields[key], itemJson);
    }
  }
  if (Object.keys(body).length === 0) {
    throw new Error("GSuiteAdmin: no update fields provided");
  }
  const { body: resp } = await apiRequest("PUT", `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}`, token, body);
  return asObj(resp);
}

async function deviceGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const deviceId = resolveLocator(node.parameters.deviceId, itemJson);
  if (!deviceId) throw new Error("GSuiteAdmin: deviceId is required");
  const { body: resp } = await apiRequest(
    "GET",
    `${DIRECTORY_API}/customer/my_customer/devices/chromeos/${encodeURIComponent(deviceId)}`,
    token,
  );
  return asObj(resp);
}

async function deviceGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 100);
  const projection = String(resolveValue(node.parameters.projection, itemJson) ?? "basic");
  const includeChildOrgunits = node.parameters.includeChildOrgunits === true;
  const filter = toCollection(node.parameters.filter, "");
  const sort = toCollection(node.parameters.sort, "sortValues");

  const params: Record<string, string | number | boolean | undefined> = {
    projection,
    includeChildOrgunits: includeChildOrgunits ? true : undefined,
    orgUnitPath: resolveValue(filter.orgUnitPath, itemJson) as string | undefined,
    query: resolveValue(filter.query, itemJson) as string | undefined,
    orderBy: sort.orderBy as string | undefined,
    sortOrder: sort.sortOrder as string | undefined,
    maxResults: returnAll ? 500 : limit,
  };
  const { body: resp } = await apiRequest(
    "GET",
    `${DIRECTORY_API}/customer/my_customer/devices/chromeos${buildQueryString(params)}`,
    token,
  );
  const devices = ((resp as { chromeosdevices?: unknown }).chromeosdevices ?? []) as Array<Record<string, unknown>>;
  const limited = returnAll ? devices : devices.slice(0, limit);
  return { chromeosdevices: limited, totalResults: limited.length };
}

async function deviceUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const deviceId = resolveLocator(node.parameters.deviceId, itemJson);
  if (!deviceId) throw new Error("GSuiteAdmin: deviceId is required");
  const options = (node.parameters.updateOptions ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  for (const key of ["orgUnitPath", "annotatedUser", "annotatedLocation", "annotatedAssetId", "notes"] as const) {
    if (options[key] !== undefined && options[key] !== "") {
      body[key] = resolveValue(options[key], itemJson);
    }
  }
  if (Object.keys(body).length === 0) {
    throw new Error("GSuiteAdmin: no update options provided");
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
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const deviceId = resolveLocator(node.parameters.deviceId, itemJson);
  if (!deviceId) throw new Error("GSuiteAdmin: deviceId is required");
  const action = String(resolveValue(node.parameters.action, itemJson) ?? "disable");
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
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
  remove: boolean,
  inputItem: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const userId = resolveLocator(node.parameters.userId, itemJson);
  const groupId = resolveLocator(node.parameters.groupId, itemJson);
  if (!userId || !groupId) {
    throw new Error("GSuiteAdmin: userId and groupId are required");
  }
  if (remove) {
    await apiRequest(
      "DELETE",
      `${DIRECTORY_API}/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      token,
    );
    return { ...inputItem.json, removed: true };
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
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  inputItem: INodeExecutionData,
): Promise<Record<string, unknown>[]> {
  const token = await getAccessToken(ctx);

  if (resource === "user") {
    switch (operation) {
      case "create":
        return [await userCreate(node, itemJson, token)];
      case "get":
        return [await userGet(node, itemJson, token)];
      case "getAll":
        return [await userGetAll(node, itemJson, token)];
      case "delete":
        return [await userDelete(node, itemJson, token, inputItem)];
      case "update":
        return [await userUpdate(node, itemJson, token)];
      case "addToGroup":
        return [await groupMembership(node, itemJson, token, false, inputItem)];
      case "removeFromGroup":
        return [await groupMembership(node, itemJson, token, true, inputItem)];
      default:
        throw new Error(`GSuiteAdmin: unsupported user operation "${operation}"`);
    }
  }

  if (resource === "group") {
    switch (operation) {
      case "create":
        return [await groupCreate(node, itemJson, token)];
      case "get":
        return [await groupGet(node, itemJson, token)];
      case "getAll":
        return [await groupGetAll(node, itemJson, token)];
      case "delete":
        return [await groupDelete(node, itemJson, token, inputItem)];
      case "update":
        return [await groupUpdate(node, itemJson, token)];
      default:
        throw new Error(`GSuiteAdmin: unsupported group operation "${operation}"`);
    }
  }

  if (resource === "device") {
    switch (operation) {
      case "get":
        return [await deviceGet(node, itemJson, token)];
      case "getAll":
        return [await deviceGetAll(node, itemJson, token)];
      case "update":
        return [await deviceUpdate(node, itemJson, token)];
      case "changeStatus":
        return [await deviceChangeStatus(node, itemJson, token)];
      default:
        throw new Error(`GSuiteAdmin: unsupported device operation "${operation}"`);
    }
  }

  throw new Error(`GSuiteAdmin: unsupported resource "${resource}"`);
}

export const gSuiteAdminExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "user") ?? "user");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "getAll") ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(ctx, node, resource, operation, itemJson, item);
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
