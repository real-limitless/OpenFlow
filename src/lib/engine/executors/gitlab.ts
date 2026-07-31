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

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

const API_VERSION = "api/v4";

export const gitlabExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "file");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};

async function getCredential(ctx: ExecutionContext, _node: INode): Promise<{ baseUrl: string; token: string }> {
  const cred = await ctx.getCredential("gitlabApi");
  if (!cred) throw new Error("GitLab: gitlabApi credential is not configured");

  const credData = cred as Record<string, unknown>;
  const server = String(credData.server ?? "https://gitlab.com");
  const token = String(credData.accessToken ?? credData.apiToken ?? credData.token ?? "");
  if (!token) throw new Error("GitLab: access token is required");

  const baseUrl = server.replace(/\/+$/, "") + "/" + API_VERSION;
  return { baseUrl, token };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  if (resource === "file") return runFileOperation(ctx, node, operation, itemJson);
  if (resource === "issue") return runIssueOperation(ctx, node, operation, itemJson);
  if (resource === "release") return runReleaseOperation(ctx, node, operation, itemJson);
  if (resource === "repository") return runRepositoryOperation(ctx, node, operation, itemJson);
  if (resource === "user") return runUserOperation(ctx, node, operation, itemJson);
  throw new Error(`GitLab: unsupported resource "${resource}"`);
}

function resolveProject(node: INode, itemJson: Record<string, unknown>): string {
  return String(resolveValue(node.parameters.project, itemJson) ?? "");
}

function encodeProject(project: string): string {
  return encodeURIComponent(project);
}

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

async function runFileOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, token } = await getCredential(ctx, node);
  const project = resolveProject(node, itemJson);
  if (!project) throw new Error("GitLab: project is required for file operations");

  const encodedProject = encodeProject(project);

  if (operation === "get") {
    const filePath = String(resolveValue(node.parameters.filePath, itemJson) ?? "");
    const ref = String(resolveValue(node.parameters.ref, itemJson) ?? "");
    if (!filePath) throw new Error("GitLab: filePath is required for file get");
    if (!ref) throw new Error("GitLab: ref is required for file get");
    const encodedPath = encodeURIComponent(filePath);
    const res = await gitlabRequest(baseUrl, "GET", `projects/${encodedProject}/repository/files/${encodedPath}`, undefined, { ref }, token);
    return { json: asObj(res) };
  }

  if (operation === "create" || operation === "edit") {
    const filePath = String(resolveValue(node.parameters.filePath, itemJson) ?? "");
    const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
    const content = String(resolveValue(node.parameters.content, itemJson) ?? "");
    const commitMessage = String(resolveValue(node.parameters.commitMessage, itemJson) ?? "");
    if (!filePath) throw new Error("GitLab: filePath is required");
    if (!branch) throw new Error("GitLab: branch is required");
    if (!content) throw new Error("GitLab: content is required");
    if (!commitMessage) throw new Error("GitLab: commitMessage is required");

    const encodedPath = encodeURIComponent(filePath);
    const method = operation === "create" ? "POST" : "PUT";
    const body: Record<string, unknown> = {
      branch,
      content,
      commit_message: commitMessage,
    };
    const res = await gitlabRequest(baseUrl, method, `projects/${encodedProject}/repository/files/${encodedPath}`, body, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const filePath = String(resolveValue(node.parameters.filePath, itemJson) ?? "");
    const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
    const commitMessage = String(resolveValue(node.parameters.commitMessage, itemJson) ?? "");
    if (!filePath) throw new Error("GitLab: filePath is required");
    if (!branch) throw new Error("GitLab: branch is required");
    if (!commitMessage) throw new Error("GitLab: commitMessage is required");

    const encodedPath = encodeURIComponent(filePath);
    const body: Record<string, unknown> = {
      branch,
      commit_message: commitMessage,
    };
    const res = await gitlabRequest(baseUrl, "DELETE", `projects/${encodedProject}/repository/files/${encodedPath}`, body, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const ref = String(resolveValue(node.parameters.ref, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (ref) params.ref = ref;
    const paginated = await gitlabGetAll(baseUrl, `projects/${encodedProject}/repository/tree`, params, token, node, itemJson);
    return paginated.map((r) => ({ json: r }));
  }

  throw new Error(`GitLab: unsupported file operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

async function runIssueOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, token } = await getCredential(ctx, node);
  const project = resolveProject(node, itemJson);
  if (!project) throw new Error("GitLab: project is required for issue operations");
  const encodedProject = encodeProject(project);

  if (operation === "create") {
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    if (!title) throw new Error("GitLab: title is required for issue create");
    const body: Record<string, unknown> = { title };
    const description = resolveValue(node.parameters.description, itemJson);
    if (description) body.description = String(description);
    const res = await gitlabRequest(baseUrl, "POST", `projects/${encodedProject}/issues`, body, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "createComment") {
    const issueIid = Number(resolveValue(node.parameters.issueIid, itemJson) ?? 0);
    const body_text = String(resolveValue(node.parameters.body, itemJson) ?? "");
    if (!issueIid) throw new Error("GitLab: issueIid is required for createComment");
    if (!body_text) throw new Error("GitLab: body is required for createComment");
    const res = await gitlabRequest(baseUrl, "POST", `projects/${encodedProject}/issues/${issueIid}/notes`, { body: body_text }, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "edit") {
    const issueIid = Number(resolveValue(node.parameters.issueIid, itemJson) ?? 0);
    if (!issueIid) throw new Error("GitLab: issueIid is required for issue edit");
    const body: Record<string, unknown> = {};
    const title = resolveValue(node.parameters.title, itemJson);
    if (title) body.title = String(title);
    const description = resolveValue(node.parameters.description, itemJson);
    if (description) body.description = String(description);
    const state = resolveValue(node.parameters.state, itemJson);
    if (state) body.state_event = String(state);
    const res = await gitlabRequest(baseUrl, "PUT", `projects/${encodedProject}/issues/${issueIid}`, body, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "get") {
    const issueIid = Number(resolveValue(node.parameters.issueIid, itemJson) ?? 0);
    if (!issueIid) throw new Error("GitLab: issueIid is required for issue get");
    const res = await gitlabRequest(baseUrl, "GET", `projects/${encodedProject}/issues/${issueIid}`, undefined, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "lock") {
    const issueIid = Number(resolveValue(node.parameters.issueIid, itemJson) ?? 0);
    if (!issueIid) throw new Error("GitLab: issueIid is required for issue lock");
    const res = await gitlabRequest(baseUrl, "PUT", `projects/${encodedProject}/issues/${issueIid}`, { discussion_locked: true }, {}, token);
    return { json: asObj(res) };
  }

  throw new Error(`GitLab: unsupported issue operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

async function runReleaseOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, token } = await getCredential(ctx, node);
  const project = resolveProject(node, itemJson);
  if (!project) throw new Error("GitLab: project is required for release operations");
  const encodedProject = encodeProject(project);

  if (operation === "create") {
    const tag = String(resolveValue(node.parameters.tag, itemJson) ?? "");
    const name = String(resolveValue(node.parameters.displayName, itemJson) ?? "");
    const description = String(resolveValue(node.parameters.description, itemJson) ?? "");
    if (!tag) throw new Error("GitLab: tag is required for release create");
    const body: Record<string, unknown> = { tag_name: tag, name: name || tag, description };
    const res = await gitlabRequest(baseUrl, "POST", `projects/${encodedProject}/releases`, body, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const tag = String(resolveValue(node.parameters.tag, itemJson) ?? "");
    if (!tag) throw new Error("GitLab: tag is required for release delete");
    const res = await gitlabRequest(baseUrl, "DELETE", `projects/${encodedProject}/releases/${encodeURIComponent(tag)}`, undefined, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "get") {
    const tag = String(resolveValue(node.parameters.tag, itemJson) ?? "");
    if (!tag) throw new Error("GitLab: tag is required for release get");
    const res = await gitlabRequest(baseUrl, "GET", `projects/${encodedProject}/releases/${encodeURIComponent(tag)}`, undefined, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const paginated = await gitlabGetAll(baseUrl, `projects/${encodedProject}/releases`, {}, token, node, itemJson);
    return paginated.map((r) => ({ json: r }));
  }

  if (operation === "update") {
    const tag = String(resolveValue(node.parameters.tag, itemJson) ?? "");
    if (!tag) throw new Error("GitLab: tag is required for release update");
    const body: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.displayName, itemJson);
    if (name) body.name = String(name);
    const description = resolveValue(node.parameters.description, itemJson);
    if (description) body.description = String(description);
    const res = await gitlabRequest(baseUrl, "PUT", `projects/${encodedProject}/releases/${encodeURIComponent(tag)}`, body, {}, token);
    return { json: asObj(res) };
  }

  throw new Error(`GitLab: unsupported release operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

async function runRepositoryOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, token } = await getCredential(ctx, node);
  const project = resolveProject(node, itemJson);
  if (!project) throw new Error("GitLab: project is required for repository operations");
  const encodedProject = encodeProject(project);

  if (operation === "get") {
    const res = await gitlabRequest(baseUrl, "GET", `projects/${encodedProject}`, undefined, {}, token);
    return { json: asObj(res) };
  }

  if (operation === "getIssues") {
    const paginated = await gitlabGetAll(baseUrl, `projects/${encodedProject}/issues`, {}, token, node, itemJson);
    return paginated.map((r) => ({ json: r }));
  }

  throw new Error(`GitLab: unsupported repository operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

async function runUserOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, token } = await getCredential(ctx, node);

  if (operation === "getRepositories") {
    const userId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!userId) throw new Error("GitLab: userId is required");
    const paginated = await gitlabGetAll(baseUrl, `users/${encodeURIComponent(userId)}/projects`, {}, token, node, itemJson);
    return paginated.map((r) => ({ json: r }));
  }

  throw new Error(`GitLab: unsupported user operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

async function gitlabGetAll(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
  const perPage = 100;
  let page = 1;
  const results: Record<string, unknown>[] = [];

  while (true) {
    const p: Record<string, string> = { ...params, per_page: String(perPage), page: String(page) };
    const res = await gitlabRequest(baseUrl, "GET", path, undefined, p, token);
    const items = res as unknown as Record<string, unknown>[];
    if (Array.isArray(items)) {
      for (const item of items) {
        results.push(item);
        if (!returnAll && results.length >= limit) return results;
      }
      if (items.length < perPage) return results;
    } else {
      return results;
    }
    page++;
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function gitlabRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
  token?: string,
): Promise<unknown> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${baseUrl}/${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      "PRIVATE-TOKEN": token ?? "",
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const glErr = obj.error as string | undefined;
      const msg = obj.message ? (typeof obj.message === "string" ? obj.message : JSON.stringify(obj.message)) : glErr ?? `Request failed with status code ${response.status}`;
      const err = new Error(msg);
      (err as unknown as Record<string, unknown>).status = response.status;
      throw err;
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}