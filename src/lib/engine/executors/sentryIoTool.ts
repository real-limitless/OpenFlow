import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { sdkHttpRequest } from "@/sdk/helpers/http";

function param(node: INode, name: string, fallback = ""): string {
  const v = node.parameters[name];
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function normalizeProjects(projects: unknown): string[] {
  if (Array.isArray(projects)) return projects.map(String);
  if (typeof projects === "string") return projects.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return {};
}

async function sentryRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const baseUrl = headers["x-sentry-base-url"] || "https://sentry.io/api/0/";
  delete headers["x-sentry-base-url"];
  const url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\//, "")}`;
  return sdkHttpRequest({ method, url, headers, body });
}

async function requestOk(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<any> {
  const res = await sentryRequest(method, path, headers, body);
  if (res.status < 200 || res.status >= 300) {
    const obj = asObj(res.body);
    const detail = typeof obj.detail === "string" ? obj.detail : `HTTP ${res.status}`;
    throw new Error(`Sentry: ${detail}`);
  }
  return res.body;
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("sentryIoApi");
  if (!cred) throw new Error("Sentry: sentryIoApi credential is not configured");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (cred.accessToken) {
    headers.Authorization = `Bearer ${cred.accessToken}`;
  } else if (cred.apiKey || cred.token) {
    headers.Authorization = `Bearer ${cred.apiKey ?? cred.token}`;
  }

  if (cred.url && typeof cred.url === "string" && cred.url.trim()) {
    headers["x-sentry-base-url"] = cred.url.replace(/\/+$/, "") + "/api/0/";
  }

  return headers;
}

export const sentryIoToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "issue");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const headers = await authHeaders(ctx);
      const results = await runOperation(node, resource, operation, headers, itemJson);
      if (Array.isArray(results)) {
        for (const json of results) {
          out.push({ json, pairedItem });
        }
      } else {
        out.push({ json: results, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  node: INode,
  resource: string,
  operation: string,
  headers: Record<string, string>,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  switch (resource) {
    case "event": return runEvent(node, operation, headers);
    case "issue": return runIssue(node, operation, headers);
    case "project": return runProject(node, operation, headers);
    case "release": return runRelease(node, operation, headers);
    case "organization": return runOrganization(node, operation, headers);
    case "team": return runTeam(node, operation, headers);
    default: throw new Error(`Sentry: unsupported resource "${resource}"`);
  }
}

async function runEvent(node: INode, operation: string, headers: Record<string, string>): Promise<Record<string, unknown>[]> {
  if (operation === "get") {
    const issueId = param(node, "issueId");
    const eventId = param(node, "eventId");
    if (!issueId || !eventId) throw new Error("Sentry: issueId and eventId are required");
    const obj = await requestOk("GET", `issues/${issueId}/events/${eventId}/`, headers);
    return [obj];
  }
  if (operation === "getAll") {
    const orgSlug = param(node, "organizationSlug");
    const projSlug = param(node, "projectSlug");
    if (!orgSlug || !projSlug) throw new Error("Sentry: organizationSlug and projectSlug are required");
    const obj = await requestOk("GET", `projects/${orgSlug}/${projSlug}/events/`, headers);
    const results = Array.isArray(obj) ? obj as Record<string, unknown>[] : [];
    return results;
  }
  throw new Error(`Sentry: unsupported event operation "${operation}"`);
}

async function runIssue(node: INode, operation: string, headers: Record<string, string>): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "get") {
    const issueId = param(node, "issueId");
    if (!issueId) throw new Error("Sentry: issueId is required");
    const obj = await requestOk("GET", `issues/${issueId}/`, headers);
    return obj;
  }
  if (operation === "getAll") {
    const orgSlug = param(node, "organizationSlug");
    const projSlug = param(node, "projectSlug");
    if (!orgSlug || !projSlug) throw new Error("Sentry: organizationSlug and projectSlug are required");
    let path = `projects/${orgSlug}/${projSlug}/issues/`;
    const params: string[] = [];
    const status = param(node, "status");
    const query = param(node, "query");
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (query) params.push(`query=${encodeURIComponent(query)}`);
    if (params.length) path += "?" + params.join("&");
    const obj = await requestOk("GET", path, headers);
    const results = Array.isArray(obj) ? obj as Record<string, unknown>[] : [];
    return results;
  }
  if (operation === "update") {
    const issueId = param(node, "issueId");
    if (!issueId) throw new Error("Sentry: issueId is required");
    const body: Record<string, unknown> = {};
    const status = param(node, "status");
    if (status) body.status = status;
    const assignedTo = param(node, "assignedTo");
    if (assignedTo) body.assignedTo = assignedTo;
    const hasSeen = node.parameters.hasSeen;
    if (hasSeen !== undefined) body.hasSeen = hasSeen;
    const isBookmarked = node.parameters.isBookmarked;
    if (isBookmarked !== undefined) body.isBookmarked = isBookmarked;
    const isSubscribed = node.parameters.isSubscribed;
    if (isSubscribed !== undefined) body.isSubscribed = isSubscribed;
    const snoozeDuration = node.parameters.snoozeDuration;
    if (snoozeDuration !== undefined) body.snoozeDuration = snoozeDuration;
    const obj = await requestOk("PUT", `issues/${issueId}/`, headers, body);
    return obj;
  }
  if (operation === "delete") {
    const issueId = param(node, "issueId");
    if (!issueId) throw new Error("Sentry: issueId is required");
    await requestOk("DELETE", `issues/${issueId}/`, headers);
    return { success: true, issueId };
  }
  throw new Error(`Sentry: unsupported issue operation "${operation}"`);
}

async function runProject(node: INode, operation: string, headers: Record<string, string>): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const orgSlug = param(node, "organizationSlug");

  if (operation === "create") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required");
    const name = param(node, "name");
    if (!name) throw new Error("Sentry: name is required");
    const body: Record<string, unknown> = { name };
    const platform = param(node, "platform");
    if (platform) body.platform = platform;
    const teamSlug = param(node, "teamSlug");
    if (teamSlug) body.team = teamSlug;
    const defaultRules = node.parameters.defaultRules;
    if (defaultRules !== undefined) body.defaultRules = defaultRules;
    const obj = await requestOk("POST", `teams/${orgSlug}/${teamSlug || orgSlug}/projects/`, headers, body);
    return obj;
  }
  if (operation === "get") {
    const projSlug = param(node, "projectSlug");
    if (!orgSlug || !projSlug) throw new Error("Sentry: organizationSlug and projectSlug are required");
    const obj = await requestOk("GET", `projects/${orgSlug}/${projSlug}/`, headers);
    return obj;
  }
  if (operation === "getAll") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required");
    let path = `projects/`;
    const query = param(node, "query");
    if (query) path += `?query=${encodeURIComponent(query)}`;
    const obj = await requestOk("GET", path, headers);
    const results = Array.isArray(obj) ? obj as Record<string, unknown>[] : [];
    return results;
  }
  if (operation === "update") {
    const projSlug = param(node, "projectSlug");
    if (!orgSlug || !projSlug) throw new Error("Sentry: organizationSlug and projectSlug are required");
    const body: Record<string, unknown> = {};
    const name = param(node, "name");
    if (name) body.name = name;
    const slug = param(node, "slug");
    if (slug) body.slug = slug;
    const platform = param(node, "platform");
    if (platform) body.platform = platform;
    const isBookmarked = node.parameters.isBookmarked;
    if (isBookmarked !== undefined) body.isBookmarked = isBookmarked;
    const isPublic = node.parameters.isPublic;
    if (isPublic !== undefined) body.isPublic = isPublic;
    const digestsMinDelay = node.parameters.digestsMinDelay;
    if (digestsMinDelay !== undefined) body.digestsMinDelay = digestsMinDelay;
    const digestsMaxDelay = node.parameters.digestsMaxDelay;
    if (digestsMaxDelay !== undefined) body.digestsMaxDelay = digestsMaxDelay;
    const obj = await requestOk("PUT", `projects/${orgSlug}/${projSlug}/`, headers, body);
    return obj;
  }
  if (operation === "delete") {
    const projSlug = param(node, "projectSlug");
    if (!orgSlug || !projSlug) throw new Error("Sentry: organizationSlug and projectSlug are required");
    await requestOk("DELETE", `projects/${orgSlug}/${projSlug}/`, headers);
    return { success: true };
  }
  throw new Error(`Sentry: unsupported project operation "${operation}"`);
}

async function runRelease(node: INode, operation: string, headers: Record<string, string>): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const orgSlug = param(node, "organizationSlug");

  if (operation === "create") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required");
    const version = param(node, "version");
    if (!version) throw new Error("Sentry: version is required");
    const body: Record<string, unknown> = { version };
    const rawProjects = node.parameters.projects;
    const projects = normalizeProjects(rawProjects);
    if (projects.length) body.projects = projects;
    const url = param(node, "url");
    if (url) body.url = url;
    const dateReleased = node.parameters.dateReleased;
    if (dateReleased) body.dateReleased = dateReleased;
    const ref = param(node, "ref");
    if (ref) body.ref = ref;
    const refs = node.parameters.refs;
    if (refs) body.refs = refs;
    const commits = node.parameters.commits;
    if (commits) body.commits = commits;
    const obj = await requestOk("POST", `organizations/${orgSlug}/releases/`, headers, body);
    return obj;
  }
  if (operation === "get") {
    const version = param(node, "version");
    if (!orgSlug || !version) throw new Error("Sentry: organizationSlug and version are required");
    const obj = await requestOk("GET", `organizations/${orgSlug}/releases/${encodeURIComponent(version)}/`, headers);
    return obj;
  }
  if (operation === "getAll") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required");
    let path = `organizations/${orgSlug}/releases/`;
    const query = param(node, "query");
    if (query) path += `?query=${encodeURIComponent(query)}`;
    const obj = await requestOk("GET", path, headers);
    const results = Array.isArray(obj) ? obj as Record<string, unknown>[] : [];
    return results;
  }
  if (operation === "update") {
    const version = param(node, "version");
    if (!orgSlug || !version) throw new Error("Sentry: organizationSlug and version are required");
    const body: Record<string, unknown> = {};
    const url = param(node, "url");
    if (url) body.url = url;
    const dateReleased = node.parameters.dateReleased;
    if (dateReleased) body.dateReleased = dateReleased;
    const ref = param(node, "ref");
    if (ref) body.ref = ref;
    const refs = node.parameters.refs;
    if (refs) body.refs = refs;
    const commits = node.parameters.commits;
    if (commits) body.commits = commits;
    const rawProjects = node.parameters.projects;
    const projects = normalizeProjects(rawProjects);
    if (projects.length) body.projects = projects;
    const obj = await requestOk("PUT", `organizations/${orgSlug}/releases/${encodeURIComponent(version)}/`, headers, body);
    return obj;
  }
  if (operation === "delete") {
    const version = param(node, "version");
    if (!orgSlug || !version) throw new Error("Sentry: organizationSlug and version are required");
    await requestOk("DELETE", `organizations/${orgSlug}/releases/${encodeURIComponent(version)}/`, headers);
    return { success: true };
  }
  throw new Error(`Sentry: unsupported release operation "${operation}"`);
}

async function runOrganization(node: INode, operation: string, headers: Record<string, string>): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const name = param(node, "name");
    if (!name) throw new Error("Sentry: name is required");
    const body: Record<string, unknown> = { name };
    const slug = param(node, "slug");
    if (slug) body.slug = slug;
    const agreeTerms = node.parameters.agreeTerms;
    if (agreeTerms !== undefined) body.agreeTerms = agreeTerms;
    const defaultTeam = param(node, "defaultTeam");
    if (defaultTeam) body.defaultTeam = defaultTeam;
    const obj = await requestOk("POST", `organizations/`, headers, body);
    return obj;
  }
  if (operation === "get") {
    const orgSlug = param(node, "organizationSlug");
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required");
    const obj = await requestOk("GET", `organizations/${orgSlug}/`, headers);
    return obj;
  }
  if (operation === "getAll") {
    const obj = await requestOk("GET", `organizations/`, headers);
    const results = Array.isArray(obj) ? obj as Record<string, unknown>[] : [];
    return results;
  }
  if (operation === "update") {
    const orgSlug = param(node, "organizationSlug");
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required");
    const body: Record<string, unknown> = {};
    const name = param(node, "name");
    if (name) body.name = name;
    const slug = param(node, "slug");
    if (slug) body.slug = slug;
    const isEarlyAdopter = node.parameters.isEarlyAdopter;
    if (isEarlyAdopter !== undefined) body.isEarlyAdopter = isEarlyAdopter;
    const obj = await requestOk("PUT", `organizations/${orgSlug}/`, headers, body);
    return obj;
  }
  throw new Error(`Sentry: unsupported organization operation "${operation}"`);
}

async function runTeam(node: INode, operation: string, headers: Record<string, string>): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const orgSlug = param(node, "organizationSlug");

  if (operation === "create") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required");
    const name = param(node, "name");
    if (!name) throw new Error("Sentry: name is required");
    const body: Record<string, unknown> = { name };
    const slug = param(node, "slug");
    if (slug) body.slug = slug;
    const obj = await requestOk("POST", `organizations/${orgSlug}/teams/`, headers, body);
    return obj;
  }
  if (operation === "get") {
    const teamSlug = param(node, "teamSlug");
    if (!orgSlug || !teamSlug) throw new Error("Sentry: organizationSlug and teamSlug are required");
    const obj = await requestOk("GET", `teams/${orgSlug}/${teamSlug}/`, headers);
    return obj;
  }
  if (operation === "getAll") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required");
    const obj = await requestOk("GET", `organizations/${orgSlug}/teams/`, headers);
    const results = Array.isArray(obj) ? obj as Record<string, unknown>[] : [];
    return results;
  }
  if (operation === "update") {
    const teamSlug = param(node, "teamSlug");
    if (!orgSlug || !teamSlug) throw new Error("Sentry: organizationSlug and teamSlug are required");
    const body: Record<string, unknown> = {};
    const name = param(node, "name");
    if (name) body.name = name;
    const slug = param(node, "slug");
    if (slug) body.slug = slug;
    const obj = await requestOk("PUT", `teams/${orgSlug}/${teamSlug}/`, headers, body);
    return obj;
  }
  if (operation === "delete") {
    const teamSlug = param(node, "teamSlug");
    if (!orgSlug || !teamSlug) throw new Error("Sentry: organizationSlug and teamSlug are required");
    await requestOk("DELETE", `teams/${orgSlug}/${teamSlug}/`, headers);
    return { success: true };
  }
  throw new Error(`Sentry: unsupported team operation "${operation}"`);
}
