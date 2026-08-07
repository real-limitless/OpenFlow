import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveResourceLocator(raw: unknown, itemJson: Record<string, unknown>): string {
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

function buildUrl(baseUrl: string, resource: string, operation: string, node: INode, itemJson: Record<string, unknown>): string {
  const base = baseUrl.replace(/\/+$/, "");
  const services = `${base}/services`;

  if (resource === "alert") {
    if (operation === "getReport") return `${services}/alerts/fired_alerts`;
    if (operation === "getMetrics") return `${services}/alerts/metrics`;
  }

  if (resource === "report") {
    const reportId = resolveResourceLocator(node.parameters.reportId, itemJson);
    if (operation === "create") return `${services}/saved/searches`;
    if (operation === "delete") return `${services}/saved/searches/${encodeURIComponent(reportId)}`;
    if (operation === "get") return `${services}/saved/searches/${encodeURIComponent(reportId)}`;
    if (operation === "getAll") return `${services}/saved/searches`;
  }

  if (resource === "search") {
    const searchJobId = resolveResourceLocator(node.parameters.searchJobId, itemJson);
    if (operation === "create") return `${services}/search/jobs`;
    if (operation === "delete") return `${services}/search/jobs/${encodeURIComponent(searchJobId)}`;
    if (operation === "get") return `${services}/search/jobs/${encodeURIComponent(searchJobId)}`;
    if (operation === "getAll") return `${services}/search/jobs`;
    if (operation === "getResult") return `${services}/search/jobs/${encodeURIComponent(searchJobId)}/results`;
  }

  if (resource === "user") {
    const userId = resolveResourceLocator(node.parameters.userId, itemJson);
    if (operation === "create") return `${services}/authentication/users`;
    if (operation === "delete") return `${services}/authentication/users/${encodeURIComponent(userId)}`;
    if (operation === "get") return `${services}/authentication/users/${encodeURIComponent(userId)}`;
    if (operation === "getAll") return `${services}/authentication/users`;
    if (operation === "update") return `${services}/authentication/users/${encodeURIComponent(userId)}`;
  }

  throw new Error(`Splunk Tool: unsupported resource/operation "${resource}/${operation}"`);
}

function buildQueryString(node: INode, itemJson: Record<string, unknown>, resource: string, operation: string): Record<string, string> {
  const params: Record<string, string> = {};

  if (resource === "search" && operation === "create") {
    const search = String(resolveValue(node.parameters.search, itemJson) ?? "");
    if (search) params.search = search;
    const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    if (additional.exec_mode) params.exec_mode = String(additional.exec_mode);
    if (additional.max_time) params.max_time = String(additional.max_time);
    if (additional.adhoc_search_level) params.adhoc_search_level = String(additional.adhoc_search_level);
    if (additional.auto_cancel) params.auto_cancel = String(additional.auto_cancel);
    if (additional.auto_finalize_ec) params.auto_finalize_ec = String(additional.auto_finalize_ec);
    if (additional.auto_pause) params.auto_pause = String(additional.auto_pause);
    if (additional.earliest_time) params.earliest_time = String(additional.earliest_time);
    if (additional.latest_time) params.latest_time = String(additional.latest_time);
    if (additional.earliest_index) params.earliest_index = String(additional.earliest_index);
    if (additional.latest_index) params.latest_index = String(additional.latest_index);
    if (additional.max_time) params.max_time = String(additional.max_time);
    if (additional.namespace) params.namespace = String(additional.namespace);
    if (additional.reduce_freq) params.reduce_freq = String(additional.reduce_freq);
    if (additional.remote_server_list) params.remote_server_list = String(additional.remote_server_list);
    if (additional.reuse_max_seconds_ago) params.reuse_max_seconds_ago = String(additional.reuse_max_seconds_ago);
    if (additional.rf) params.rf = String(additional.rf);
    if (additional.search_mode) params.search_mode = String(additional.search_mode);
    if (additional.status_buckets) params.status_buckets = String(additional.status_buckets);
    if (additional.timeout) params.timeout = String(additional.timeout);
    if (additional.workload_pool) params.workload_pool = String(additional.workload_pool);
    if (additional.indexedRealtimeOffset) params.indexedRealtimeOffset = String(additional.indexedRealtimeOffset);
  }

  if (resource === "search" && operation === "getResult") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    if (!returnAll) params.count = String(limit);
    params.output_mode = "json";
  }

  if ((resource === "search" && operation === "getAll") || (resource === "report" && operation === "getAll") || (resource === "user" && operation === "getAll")) {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    if (!returnAll) params.count = String(limit);
    params.output_mode = "json";
  }

  if (resource === "search" && operation === "getAll") {
    const sortOpts = (node.parameters.sortOptions ?? {}) as Record<string, unknown>;
    const sortDir = String(sortOpts.sort_dir ?? "");
    const sortKey = String(sortOpts.sort_key ?? "");
    const sortMode = String(sortOpts.sort_mode ?? "");
    if (sortDir) params.sort_dir = sortDir;
    if (sortKey) params.sort_field = sortKey;
    if (sortMode) params.sort_mode = sortMode;
  }

  if (resource === "report" && operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (name) params.name = name;
  }

  if (resource === "user" && operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const password = String(resolveValue(node.parameters.password, itemJson) ?? "");
    const roles = node.parameters.roles;
    if (name) params.name = name;
    if (password) params.password = password;
    if (Array.isArray(roles)) params.roles = roles.join(",");
    const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    if (additional.email) params.email = String(additional.email);
    if (additional.realname) params.realname = String(additional.realname);
  }

  if (resource === "user" && operation === "update") {
    const update = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
    if (update.email) params.email = String(update.email);
    if (update.realname) params.realname = String(update.realname);
    if (update.password) params.password = String(update.password);
    if (update.roles && Array.isArray(update.roles)) params.roles = (update.roles as string[]).join(",");
  }

  return params;
}

async function splunkRequest(
  baseUrl: string,
  token: string,
  method: string,
  url: string,
  params?: Record<string, string>,
  body?: Record<string, string>,
): Promise<unknown> {
  const finalUrl = params && Object.keys(params).length > 0 ? `${url}?${new URLSearchParams(params).toString()}` : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    };
    if (body && Object.keys(body).length > 0) {
      init.body = new URLSearchParams(body).toString();
      (init.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
    }
    const response = await fetch(finalUrl, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = obj.messages
        ? (Array.isArray(obj.messages) ? (obj.messages as Array<Record<string, unknown>>).map((m) => String(m.text ?? "")).join("; ") : String(obj.messages))
        : obj.message
          ? String(obj.message)
          : `Splunk request failed with status code ${response.status}`;
      throw new Error(`Splunk Tool: ${errMsg}`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Splunk Tool:")) throw err;
    if (err instanceof Error) throw new Error(`Splunk Tool request failed: ${err.message}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parseSplunkResponse(raw: unknown): Record<string, unknown> | Array<Record<string, unknown>> {
  const obj = asObj(raw);
  const entry = obj.entry;
  if (entry && Array.isArray(entry)) {
    return entry.map((e: Record<string, unknown>) => {
      const content = e.content ?? {};
      const name = e.name ?? "";
      const id = e.id ?? "";
      return { ...asObj(content), id: name || id, name };
    });
  }
  const results = obj.results;
  if (results && Array.isArray(results)) {
    return results.map((r: unknown) => {
      if (r && typeof r === "object") {
        const rObj = r as Record<string, unknown>;
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rObj)) {
          if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
            cleaned[k] = (v as Record<string, unknown>).value;
          } else {
            cleaned[k] = v;
          }
        }
        return cleaned;
      }
      return { value: r };
    });
  }
  return obj;
}

function extractSearchJob(raw: unknown): Record<string, unknown> {
  const obj = asObj(raw);
  const entry = obj.entry;
  if (entry && Array.isArray(entry) && entry.length > 0) {
    const first = entry[0] as Record<string, unknown>;
    const content = (first.content ?? {}) as Record<string, unknown>;
    return {
      sid: first.name ?? obj.sid ?? "",
      dispatchState: content.dispatchState ?? "",
      eventCount: content.eventCount ?? 0,
      resultCount: content.resultCount ?? 0,
    };
  }
  return { sid: obj.sid ?? "", dispatchState: obj.dispatchState ?? "", eventCount: obj.eventCount ?? 0, resultCount: obj.resultCount ?? 0 };
}

export const splunkToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "search");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runSplunkOperation(ctx, node, resource, operation, itemJson);
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

async function getBaseUrlAndToken(ctx: ExecutionContext): Promise<{ baseUrl: string; token: string }> {
  const cred = await ctx.getCredential("splunkApi");
  const baseUrl = cred ? String(cred.baseUrl ?? "") : "";
  const token = cred ? String(cred.authToken ?? "") : "";
  if (!baseUrl || !token) {
    throw new Error("Splunk Tool: splunkApi credential is not configured");
  }
  return { baseUrl, token };
}

async function runSplunkOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Array<Record<string, unknown>>> {
  const { baseUrl, token } = await getBaseUrlAndToken(ctx);

  if (resource === "search" && operation === "create") {
    const search = String(resolveValue(node.parameters.search, itemJson) ?? "");
    if (!search) throw new Error("Splunk Tool: search is required");
    const params = buildQueryString(node, itemJson, resource, operation);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) body[k] = v;
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "POST", url, undefined, body);
    return extractSearchJob(raw);
  }

  if (operation === "delete") {
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    await splunkRequest(baseUrl, token, "DELETE", url);
    return { success: true };
  }

  if (operation === "get") {
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "GET", url);
    if (resource === "search") return extractSearchJob(raw);
    const parsed = parseSplunkResponse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : parsed;
  }

  if (operation === "getAll") {
    const params = buildQueryString(node, itemJson, resource, operation);
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "GET", url, params);
    const parsed = parseSplunkResponse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  if (resource === "search" && operation === "getResult") {
    const params = buildQueryString(node, itemJson, resource, operation);
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "GET", url, params);
    const parsed = parseSplunkResponse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  if (resource === "report" && operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Splunk Tool: name is required");
    const params = buildQueryString(node, itemJson, resource, operation);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) body[k] = v;
    const searchJobId = resolveResourceLocator(node.parameters.searchJobId, itemJson);
    if (searchJobId) body.search = `| loadjob ${searchJobId}`;
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "POST", url, undefined, body);
    return { name, id: body.name ?? "", ...asObj(raw) };
  }

  if (resource === "alert" && operation === "getReport") {
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "GET", url);
    return parseSplunkResponse(raw);
  }

  if (resource === "alert" && operation === "getMetrics") {
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "GET", url);
    return asObj(raw);
  }

  if (resource === "user" && operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const password = String(resolveValue(node.parameters.password, itemJson) ?? "");
    if (!name) throw new Error("Splunk Tool: name is required");
    if (!password) throw new Error("Splunk Tool: password is required");
    const params = buildQueryString(node, itemJson, resource, operation);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) body[k] = v;
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "POST", url, undefined, body);
    return { name, id: name, roles: node.parameters.roles ?? ["user"], ...asObj(raw) };
  }

  if (resource === "user" && (operation === "update")) {
    const userId = resolveResourceLocator(node.parameters.userId, itemJson);
    if (!userId) throw new Error("Splunk Tool: userId is required");
    const params = buildQueryString(node, itemJson, resource, operation);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) body[k] = v;
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "POST", url, undefined, body);
    return { id: userId, ...asObj(raw) };
  }

  if (resource === "user" && operation === "get") {
    const url = buildUrl(baseUrl, resource, operation, node, itemJson);
    const raw = await splunkRequest(baseUrl, token, "GET", url);
    const parsed = parseSplunkResponse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : parsed;
  }

  throw new Error(`Splunk Tool: unsupported resource/operation "${resource}/${operation}"`);
}
