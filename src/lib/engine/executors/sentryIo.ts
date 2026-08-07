import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { requireCredential } from "@/sdk/helpers/credentials";

const SENTRY_CLOUD_BASE = "https://sentry.io/api/0";

async function resolveBaseUrl(ctx: Parameters<NodeExecutor>[0]): Promise<string> {
  const cred = await requireCredential(ctx, "sentryIoApi");
  const urlField = String(cred.url ?? "").trim();
  if (urlField) {
    const base = urlField.replace(/\/+$/, "");
    return base.endsWith("/api/0") ? base : `${base}/api/0`;
  }
  return SENTRY_CLOUD_BASE;
}

async function resolveAuthHeaders(ctx: Parameters<NodeExecutor>[0]): Promise<Record<string, string>> {
  const cred = await requireCredential(ctx, "sentryIoApi");
  const token = String(cred.accessToken ?? cred.apiKey ?? "");
  return { Authorization: `Bearer ${token}`, "content-type": "application/json" };
}

export const sentryIoExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] = inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "issue");
  const operation = ctx.getParam<string>("operation", "get");
  const continueOnFail = ctx.continueOnFail();

  const baseUrl = await resolveBaseUrl(ctx);
  const authHeaders = await resolveAuthHeaders(ctx);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      switch (resource) {
        case "event":
          result = await handleEvent(operation, ctx, baseUrl, authHeaders);
          break;
        case "issue":
          result = await handleIssue(operation, ctx, baseUrl, authHeaders);
          break;
        case "project":
          result = await handleProject(operation, ctx, baseUrl, authHeaders);
          break;
        case "release":
          result = await handleRelease(operation, ctx, baseUrl, authHeaders);
          break;
        case "organization":
          result = await handleOrganization(operation, ctx, baseUrl, authHeaders);
          break;
        case "team":
          result = await handleTeam(operation, ctx, baseUrl, authHeaders);
          break;
        default:
          throw new Error(`Sentry: unsupported resource "${resource}"`);
      }

      out.push({
        json: result as Record<string, unknown>,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

async function sentryFetch(
  baseUrl: string,
  path: string,
  authHeaders: Record<string, string>,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: { ...authHeaders, accept: "application/json", ...(options.headers as Record<string, string>) },
    method: options.method ?? "GET",
    body: options.body,
  });
  if (!res.ok) {
    throw new Error(`Sentry API: HTTP ${res.status} ${res.statusText ?? ""}`.trim());
  }
  if (res.status === 204) {
    return { success: true };
  }
  return (await res.json()) as Record<string, unknown>;
}

async function handleEvent(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  authHeaders: Record<string, string>,
): Promise<unknown> {
  if (operation === "get") {
    const issueId = ctx.getParam<string>("issueId", "");
    const eventId = ctx.getParam<string>("eventId", "");
    if (!issueId || !eventId) {
      throw new Error("Sentry: issueId and eventId are required for event get");
    }
    return sentryFetch(baseUrl, `/issues/${issueId}/events/${eventId}/`, authHeaders);
  }
  if (operation === "getAll") {
    const orgSlug = ctx.getParam<string>("organizationSlug", "");
    const projSlug = ctx.getParam<string>("projectSlug", "");
    if (!orgSlug || !projSlug) {
      throw new Error("Sentry: organizationSlug and projectSlug are required for event getAll");
    }
    return sentryFetch(baseUrl, `/projects/${orgSlug}/${projSlug}/events/`, authHeaders);
  }
  throw new Error(`Sentry: unsupported event operation "${operation}"`);
}

async function handleIssue(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  authHeaders: Record<string, string>,
): Promise<unknown> {
  const issueId = ctx.getParam<string>("issueId", "");
  if (operation === "get" || operation === "delete" || operation === "update") {
    if (!issueId) {
      throw new Error("Sentry: issueId is required");
    }
  }
  if (operation === "get") {
    return sentryFetch(baseUrl, `/issues/${issueId}/`, authHeaders);
  }
  if (operation === "getAll") {
    const orgSlug = ctx.getParam<string>("organizationSlug", "");
    const projSlug = ctx.getParam<string>("projectSlug", "");
    const query = ctx.getParam<string>("query", "");
    const status = ctx.getParam<string>("status", "");
    if (!orgSlug || !projSlug) {
      throw new Error("Sentry: organizationSlug and projectSlug are required for issue getAll");
    }
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (status) params.set("status", status);
    const qs = params.toString();
    return sentryFetch(baseUrl, `/projects/${orgSlug}/${projSlug}/issues/${qs ? `?${qs}` : ""}`, authHeaders);
  }
  if (operation === "update") {
    const body: Record<string, unknown> = {};
    const status = ctx.getParam<string>("status", "");
    if (status) body.status = status;
    const assignedTo = ctx.getParam<string>("assignedTo", "");
    if (assignedTo) body.assignedTo = assignedTo;
    const hasSeen = ctx.getParam<boolean>("hasSeen", undefined);
    if (hasSeen !== undefined) body.hasSeen = hasSeen;
    const isBookmarked = ctx.getParam<boolean>("isBookmarked", undefined);
    if (isBookmarked !== undefined) body.isBookmarked = isBookmarked;
    const isSubscribed = ctx.getParam<boolean>("isSubscribed", undefined);
    if (isSubscribed !== undefined) body.isSubscribed = isSubscribed;
    const snoozeDuration = ctx.getParam<number>("snoozeDuration", 0);
    if (snoozeDuration > 0) body.snoozeDuration = snoozeDuration;
    return sentryFetch(baseUrl, `/issues/${issueId}/`, authHeaders, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (operation === "delete") {
    return sentryFetch(baseUrl, `/issues/${issueId}/`, authHeaders, { method: "DELETE" });
  }
  throw new Error(`Sentry: unsupported issue operation "${operation}"`);
}

async function handleProject(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  authHeaders: Record<string, string>,
): Promise<unknown> {
  const orgSlug = ctx.getParam<string>("organizationSlug", "");
  const projSlug = ctx.getParam<string>("projectSlug", "");
  if (operation === "get" || operation === "delete" || operation === "update") {
    if (!orgSlug || !projSlug) {
      throw new Error("Sentry: organizationSlug and projectSlug are required");
    }
  }
  if (operation === "create") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required for project create");
    const name = ctx.getParam<string>("name", "");
    if (!name) throw new Error("Sentry: name is required for project create");
    const body: Record<string, unknown> = { name };
    const platform = ctx.getParam<string>("platform", "");
    if (platform) body.platform = platform;
    const teamSlug = ctx.getParam<string>("teamSlug", "");
    if (teamSlug) body.team = teamSlug;
    const defaultRules = ctx.getParam<boolean>("defaultRules", undefined);
    if (defaultRules !== undefined) body.defaultRules = defaultRules;
    return sentryFetch(baseUrl, `/teams/${orgSlug}/${teamSlug || orgSlug}/projects/`, authHeaders, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (operation === "get") {
    return sentryFetch(baseUrl, `/projects/${orgSlug}/${projSlug}/`, authHeaders);
  }
  if (operation === "getAll") {
    if (!orgSlug) {
      throw new Error("Sentry: organizationSlug is required for project getAll");
    }
    const query = ctx.getParam<string>("query", "");
    const params = query ? `?query=${encodeURIComponent(query)}` : "";
    return sentryFetch(baseUrl, `/organizations/${orgSlug}/projects/${params}`, authHeaders);
  }
  if (operation === "update") {
    const body: Record<string, unknown> = {};
    const name = ctx.getParam<string>("name", "");
    if (name) body.name = name;
    const slug = ctx.getParam<string>("slug", "");
    if (slug) body.slug = slug;
    const platform = ctx.getParam<string>("platform", "");
    if (platform) body.platform = platform;
    const isBookmarked = ctx.getParam<boolean>("isBookmarked", undefined);
    if (isBookmarked !== undefined) body.isBookmarked = isBookmarked;
    const isPublic = ctx.getParam<boolean>("isPublic", undefined);
    if (isPublic !== undefined) body.isPublic = isPublic;
    const digestsMinDelay = ctx.getParam<number>("digestsMinDelay", 0);
    if (digestsMinDelay > 0) body.digestsMinDelay = digestsMinDelay;
    const digestsMaxDelay = ctx.getParam<number>("digestsMaxDelay", 0);
    if (digestsMaxDelay > 0) body.digestsMaxDelay = digestsMaxDelay;
    return sentryFetch(baseUrl, `/projects/${orgSlug}/${projSlug}/`, authHeaders, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (operation === "delete") {
    return sentryFetch(baseUrl, `/projects/${orgSlug}/${projSlug}/`, authHeaders, { method: "DELETE" });
  }
  throw new Error(`Sentry: unsupported project operation "${operation}"`);
}

async function handleRelease(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  authHeaders: Record<string, string>,
): Promise<unknown> {
  const orgSlug = ctx.getParam<string>("organizationSlug", "");
  const version = ctx.getParam<string>("version", "");
  if (operation !== "getAll" && (!orgSlug || !version)) {
    throw new Error("Sentry: organizationSlug and version are required");
  }
  if (operation === "create") {
    const projects = ctx.getParam<string>("projects", "");
    const body: Record<string, unknown> = {
      version,
      projects: projects ? projects.split(",").map((s) => s.trim()) : [],
    };
    const url = ctx.getParam<string>("url", "");
    if (url) body.url = url;
    const dateReleased = ctx.getParam<string>("dateReleased", "");
    if (dateReleased) body.dateReleased = dateReleased;
    const commits = ctx.getParam<string>("commits", "");
    if (commits) body.commits = commits;
    const ref = ctx.getParam<string>("ref", "");
    if (ref) body.ref = ref;
    const refs = ctx.getParam<string>("refs", "");
    if (refs) body.refs = refs;
    return sentryFetch(baseUrl, `/organizations/${orgSlug}/releases/`, authHeaders, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (operation === "get") {
    return sentryFetch(baseUrl, `/organizations/${orgSlug}/releases/${encodeURIComponent(version)}/`, authHeaders);
  }
  if (operation === "getAll") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required for release getAll");
    const query = ctx.getParam<string>("query", "");
    const params = query ? `?query=${encodeURIComponent(query)}` : "";
    return sentryFetch(baseUrl, `/organizations/${orgSlug}/releases/${params}`, authHeaders);
  }
  if (operation === "update") {
    const body: Record<string, unknown> = {};
    const url = ctx.getParam<string>("url", "");
    if (url) body.url = url;
    const dateReleased = ctx.getParam<string>("dateReleased", "");
    if (dateReleased) body.dateReleased = dateReleased;
    const commits = ctx.getParam<string>("commits", "");
    if (commits) body.commits = commits;
    const ref = ctx.getParam<string>("ref", "");
    if (ref) body.ref = ref;
    const refs = ctx.getParam<string>("refs", "");
    if (refs) body.refs = refs;
    const projects = ctx.getParam<string>("projects", "");
    if (projects) body.projects = projects.split(",").map((s) => s.trim());
    return sentryFetch(baseUrl, `/organizations/${orgSlug}/releases/${encodeURIComponent(version)}/`, authHeaders, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (operation === "delete") {
    return sentryFetch(baseUrl, `/organizations/${orgSlug}/releases/${encodeURIComponent(version)}/`, authHeaders, {
      method: "DELETE",
    });
  }
  throw new Error(`Sentry: unsupported release operation "${operation}"`);
}

async function handleOrganization(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  authHeaders: Record<string, string>,
): Promise<unknown> {
  if (operation === "create") {
    const name = ctx.getParam<string>("name", "");
    if (!name) throw new Error("Sentry: name is required for organization create");
    const body: Record<string, unknown> = { name };
    const slug = ctx.getParam<string>("slug", "");
    if (slug) body.slug = slug;
    const agreeTerms = ctx.getParam<boolean>("agreeTerms", undefined);
    if (agreeTerms !== undefined) body.agreeTerms = agreeTerms;
    const defaultTeam = ctx.getParam<string>("defaultTeam", "");
    if (defaultTeam) body.defaultTeam = defaultTeam;
    return sentryFetch(baseUrl, `/organizations/`, authHeaders, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (operation === "get") {
    const slug = ctx.getParam<string>("organizationSlug", "");
    if (!slug) throw new Error("Sentry: organizationSlug is required");
    return sentryFetch(baseUrl, `/organizations/${slug}/`, authHeaders);
  }
  if (operation === "getAll") {
    return sentryFetch(baseUrl, `/organizations/`, authHeaders);
  }
  if (operation === "update") {
    const slug = ctx.getParam<string>("organizationSlug", "");
    if (!slug) throw new Error("Sentry: organizationSlug is required");
    const body: Record<string, unknown> = {};
    const name = ctx.getParam<string>("name", "");
    if (name) body.name = name;
    const newSlug = ctx.getParam<string>("slug", "");
    if (newSlug) body.slug = newSlug;
    const isEarlyAdopter = ctx.getParam<boolean>("isEarlyAdopter", undefined);
    if (isEarlyAdopter !== undefined) body.isEarlyAdopter = isEarlyAdopter;
    return sentryFetch(baseUrl, `/organizations/${slug}/`, authHeaders, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  throw new Error(`Sentry: unsupported organization operation "${operation}"`);
}

async function handleTeam(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  authHeaders: Record<string, string>,
): Promise<unknown> {
  const orgSlug = ctx.getParam<string>("organizationSlug", "");
  const teamSlug = ctx.getParam<string>("teamSlug", "");
  if (operation === "get" || operation === "delete" || operation === "update") {
    if (!orgSlug || !teamSlug)
      throw new Error("Sentry: organizationSlug and teamSlug are required");
  }
  if (operation === "create") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required for team create");
    const name = ctx.getParam<string>("name", "");
    if (!name) throw new Error("Sentry: name is required for team create");
    const body: Record<string, unknown> = { name };
    const slug = ctx.getParam<string>("slug", "");
    if (slug) body.slug = slug;
    return sentryFetch(baseUrl, `/organizations/${orgSlug}/teams/`, authHeaders, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (operation === "get") {
    return sentryFetch(baseUrl, `/teams/${orgSlug}/${teamSlug}/`, authHeaders);
  }
  if (operation === "getAll") {
    if (!orgSlug) throw new Error("Sentry: organizationSlug is required for team getAll");
    return sentryFetch(baseUrl, `/organizations/${orgSlug}/teams/`, authHeaders);
  }
  if (operation === "update") {
    const body: Record<string, unknown> = {};
    const name = ctx.getParam<string>("name", "");
    if (name) body.name = name;
    const slug = ctx.getParam<string>("slug", "");
    if (slug) body.slug = slug;
    return sentryFetch(baseUrl, `/teams/${orgSlug}/${teamSlug}/`, authHeaders, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (operation === "delete") {
    return sentryFetch(baseUrl, `/teams/${orgSlug}/${teamSlug}/`, authHeaders, { method: "DELETE" });
  }
  throw new Error(`Sentry: unsupported team operation "${operation}"`);
}
