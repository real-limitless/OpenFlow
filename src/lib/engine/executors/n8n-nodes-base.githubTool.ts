import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";
import { assertAllowUrl, emitToolHandle } from "../tool-handle";

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

async function getCredential(ctx: {
  getCredential(name: string): Promise<unknown>;
}): Promise<{ baseUrl: string; token: string }> {
  const cred = await ctx.getCredential("githubApi");
  if (!cred) throw new Error("GitHub: githubApi credential is not configured");

  const credData = cred as Record<string, unknown>;
  const token = String(credData.accessToken ?? credData.apiToken ?? credData.token ?? "");
  if (!token) throw new Error("GitHub: access token is required");

  const server = String(credData.server ?? "https://api.github.com");
  const baseUrl = server.replace(/\/+$/, "");
  return { baseUrl, token };
}

function owner(
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
): string {
  return String(resolveValue(node.parameters.owner, itemJson) ?? "");
}

function repo(
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
): string {
  return String(resolveValue(node.parameters.repository, itemJson) ?? "");
}

async function githubRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
  token?: string,
): Promise<unknown> {
  const qs =
    params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${baseUrl}/${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token ?? ""}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "OpenFlow",
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
    } catch {
      /* keep text */
    }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const ghMsg = (obj.message as string) ?? `Request failed with status code ${response.status}`;
      const err = new Error(ghMsg);
      (err as unknown as Record<string, unknown>).status = response.status;
      throw err;
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function githubGetAll(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  token: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
  const perPage = 100;
  let page = 1;
  const results: Record<string, unknown>[] = [];

  while (true) {
    const p: Record<string, string> = { ...params, per_page: String(perPage), page: String(page) };
    const res = await githubRequest(baseUrl, "GET", path, undefined, p, token);
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

async function runFileOperation(
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const own = owner(node, itemJson);
  const rep = repo(node, itemJson);
  if (!own || !rep)
    throw new Error("GitHub: owner and repository are required for file operations");
  const filePath = String(resolveValue(node.parameters.filePath, itemJson) ?? "");

  if (operation === "get") {
    if (!filePath) throw new Error("GitHub: filePath is required for file get");
    const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (branch) params.ref = branch;
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/contents/${encodeURIComponent(filePath)}`,
      undefined,
      params,
      token,
    );
    return [asObj(res)];
  }

  if (operation === "create" || operation === "edit") {
    const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
    const content = String(resolveValue(node.parameters.content, itemJson) ?? "");
    const commitMessage = String(resolveValue(node.parameters.commitMessage, itemJson) ?? "");
    if (!filePath) throw new Error("GitHub: filePath is required");
    if (!branch) throw new Error("GitHub: branch is required");
    if (!commitMessage) throw new Error("GitHub: commitMessage is required");

    const payload: Record<string, unknown> = {
      message: commitMessage,
      content: Buffer.from(content).toString("base64"),
      branch,
    };
    const res = await githubRequest(
      baseUrl,
      "PUT",
      `repos/${own}/${rep}/contents/${encodeURIComponent(filePath)}`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "delete") {
    const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
    const commitMessage = String(resolveValue(node.parameters.commitMessage, itemJson) ?? "");
    if (!filePath) throw new Error("GitHub: filePath is required");
    if (!branch) throw new Error("GitHub: branch is required");
    if (!commitMessage) throw new Error("GitHub: commitMessage is required");

    const payload: Record<string, unknown> = { message: commitMessage, branch };
    const res = await githubRequest(
      baseUrl,
      "DELETE",
      `repos/${own}/${rep}/contents/${encodeURIComponent(filePath)}`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "getAll") {
    const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (branch) params.ref = branch;
    const paginated = await githubGetAll(
      baseUrl,
      `repos/${own}/${rep}/contents/${encodeURIComponent(filePath)}`,
      params,
      token,
      node,
      itemJson,
    );
    return paginated;
  }

  throw new Error(`GitHub: unsupported file operation "${operation}"`);
}

async function runIssueOperation(
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const own = owner(node, itemJson);
  const rep = repo(node, itemJson);
  if (!own || !rep)
    throw new Error("GitHub: owner and repository are required for issue operations");

  if (operation === "create") {
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    if (!title) throw new Error("GitHub: title is required for issue create");
    const payload: Record<string, unknown> = { title };
    const bodyText = resolveValue(node.parameters.body, itemJson);
    if (bodyText) payload.body = String(bodyText);
    const labels = resolveValue(node.parameters.labels, itemJson);
    if (labels) {
      const labelStr = String(labels);
      payload.labels = labelStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const res = await githubRequest(
      baseUrl,
      "POST",
      `repos/${own}/${rep}/issues`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "createComment") {
    const issueNumber = Number(resolveValue(node.parameters.issueNumber, itemJson) ?? 0);
    const bodyText = String(resolveValue(node.parameters.body, itemJson) ?? "");
    if (!issueNumber) throw new Error("GitHub: issueNumber is required for createComment");
    if (!bodyText) throw new Error("GitHub: body is required for createComment");
    const res = await githubRequest(
      baseUrl,
      "POST",
      `repos/${own}/${rep}/issues/${issueNumber}/comments`,
      { body: bodyText },
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "edit") {
    const issueNumber = Number(resolveValue(node.parameters.issueNumber, itemJson) ?? 0);
    if (!issueNumber) throw new Error("GitHub: issueNumber is required for issue edit");
    const payload: Record<string, unknown> = {};
    const title = resolveValue(node.parameters.title, itemJson);
    if (title) payload.title = String(title);
    const bodyText = resolveValue(node.parameters.body, itemJson);
    if (bodyText) payload.body = String(bodyText);
    const state = resolveValue(node.parameters.state, itemJson);
    if (state) payload.state = String(state);
    const labels = resolveValue(node.parameters.labels, itemJson);
    if (labels) {
      const labelStr = String(labels);
      payload.labels = labelStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const res = await githubRequest(
      baseUrl,
      "PATCH",
      `repos/${own}/${rep}/issues/${issueNumber}`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "get") {
    const issueNumber = Number(resolveValue(node.parameters.issueNumber, itemJson) ?? 0);
    if (!issueNumber) throw new Error("GitHub: issueNumber is required for issue get");
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/issues/${issueNumber}`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "lock") {
    const issueNumber = Number(resolveValue(node.parameters.issueNumber, itemJson) ?? 0);
    if (!issueNumber) throw new Error("GitHub: issueNumber is required for issue lock");
    const res = await githubRequest(
      baseUrl,
      "PUT",
      `repos/${own}/${rep}/issues/${issueNumber}/lock`,
      {},
      {},
      token,
    );
    return [asObj(res)];
  }

  throw new Error(`GitHub: unsupported issue operation "${operation}"`);
}

async function runOrgOperation(
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const own = owner(node, itemJson);
  if (!own) throw new Error("GitHub: owner is required for organization operations");

  if (operation === "getRepositories") {
    return githubGetAll(baseUrl, `orgs/${own}/repos`, {}, token, node, itemJson);
  }

  throw new Error(`GitHub: unsupported organization operation "${operation}"`);
}

async function runReleaseOperation(
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const own = owner(node, itemJson);
  const rep = repo(node, itemJson);
  if (!own || !rep)
    throw new Error("GitHub: owner and repository are required for release operations");

  if (operation === "create") {
    const tag = String(resolveValue(node.parameters.tag, itemJson) ?? "");
    const name = String(resolveValue(node.parameters.releaseName, itemJson) ?? "");
    const body = String(resolveValue(node.parameters.releaseBody, itemJson) ?? "");
    if (!tag) throw new Error("GitHub: tag is required for release create");
    const payload: Record<string, unknown> = { tag_name: tag, name: name || tag };
    if (body) payload.body = body;
    const res = await githubRequest(
      baseUrl,
      "POST",
      `repos/${own}/${rep}/releases`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "delete") {
    const releaseId = Number(resolveValue(node.parameters.releaseId, itemJson) ?? 0);
    if (!releaseId) throw new Error("GitHub: releaseId is required for release delete");
    const res = await githubRequest(
      baseUrl,
      "DELETE",
      `repos/${own}/${rep}/releases/${releaseId}`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "get") {
    const releaseId = Number(resolveValue(node.parameters.releaseId, itemJson) ?? 0);
    if (!releaseId) throw new Error("GitHub: releaseId is required for release get");
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/releases/${releaseId}`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "getAll") {
    return githubGetAll(baseUrl, `repos/${own}/${rep}/releases`, {}, token, node, itemJson);
  }

  if (operation === "update") {
    const releaseId = Number(resolveValue(node.parameters.releaseId, itemJson) ?? 0);
    if (!releaseId) throw new Error("GitHub: releaseId is required for release update");
    const payload: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.releaseName, itemJson);
    if (name) payload.name = String(name);
    const body = resolveValue(node.parameters.releaseBody, itemJson);
    if (body) payload.body = String(body);
    const res = await githubRequest(
      baseUrl,
      "PATCH",
      `repos/${own}/${rep}/releases/${releaseId}`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  throw new Error(`GitHub: unsupported release operation "${operation}"`);
}

async function runRepoOperation(
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const own = owner(node, itemJson);
  const rep = repo(node, itemJson);
  if (!own || !rep)
    throw new Error("GitHub: owner and repository are required for repository operations");

  if (operation === "get") {
    const res = await githubRequest(baseUrl, "GET", `repos/${own}/${rep}`, undefined, {}, token);
    return [asObj(res)];
  }

  if (operation === "getIssues") {
    return githubGetAll(baseUrl, `repos/${own}/${rep}/issues`, {}, token, node, itemJson);
  }

  if (operation === "getLicense") {
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/license`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "getPullRequests") {
    return githubGetAll(baseUrl, `repos/${own}/${rep}/pulls`, {}, token, node, itemJson);
  }

  if (operation === "getUserProfile") {
    const res = await githubRequest(baseUrl, "GET", `users/${own}`, undefined, {}, token);
    return [asObj(res)];
  }

  if (operation === "listPopularPaths") {
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/traffic/popular/paths`,
      undefined,
      {},
      token,
    );
    const list = Array.isArray(res) ? res : [];
    return list as Record<string, unknown>[];
  }

  if (operation === "listReferrers") {
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/traffic/popular/referrers`,
      undefined,
      {},
      token,
    );
    const list = Array.isArray(res) ? res : [];
    return list as Record<string, unknown>[];
  }

  throw new Error(`GitHub: unsupported repository operation "${operation}"`);
}

async function runReviewOperation(
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const own = owner(node, itemJson);
  const rep = repo(node, itemJson);
  if (!own || !rep)
    throw new Error("GitHub: owner and repository are required for review operations");
  const prNumber = Number(resolveValue(node.parameters.pullRequestNumber, itemJson) ?? 0);
  if (!prNumber) throw new Error("GitHub: pullRequestNumber is required for review operations");

  if (operation === "create") {
    const body = String(resolveValue(node.parameters.reviewBody, itemJson) ?? "");
    const event = String(resolveValue(node.parameters.reviewEvent, itemJson) ?? "comment");
    const payload: Record<string, unknown> = { event };
    if (body) payload.body = body;
    const res = await githubRequest(
      baseUrl,
      "POST",
      `repos/${own}/${rep}/pulls/${prNumber}/reviews`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "get") {
    const reviewId = Number(resolveValue(node.parameters.reviewId, itemJson) ?? 0);
    if (!reviewId) throw new Error("GitHub: reviewId is required for review get");
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/pulls/${prNumber}/reviews/${reviewId}`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "getAll") {
    return githubGetAll(
      baseUrl,
      `repos/${own}/${rep}/pulls/${prNumber}/reviews`,
      {},
      token,
      node,
      itemJson,
    );
  }

  if (operation === "update") {
    const reviewId = Number(resolveValue(node.parameters.reviewId, itemJson) ?? 0);
    if (!reviewId) throw new Error("GitHub: reviewId is required for review update");
    const body = String(resolveValue(node.parameters.reviewBody, itemJson) ?? "");
    const res = await githubRequest(
      baseUrl,
      "PUT",
      `repos/${own}/${rep}/pulls/${prNumber}/reviews/${reviewId}`,
      { body },
      {},
      token,
    );
    return [asObj(res)];
  }

  throw new Error(`GitHub: unsupported review operation "${operation}"`);
}

async function runUserOperation(
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const user = String(resolveValue(node.parameters.user, itemJson) ?? "");
  if (!user) throw new Error("GitHub: user is required for user operations");

  if (operation === "getRepositories") {
    return githubGetAll(baseUrl, `users/${user}/repos`, {}, token, node, itemJson);
  }

  if (operation === "invite") {
    const org = String(resolveValue(node.parameters.organization, itemJson) ?? "");
    if (!org) throw new Error("GitHub: organization parameter is required for user invite");
    const payload: Record<string, unknown> = {};
    if (user.includes("@")) {
      payload.email = user;
    } else {
      payload.invitee_id = user;
    }
    const res = await githubRequest(
      baseUrl,
      "POST",
      `orgs/${org}/invitations`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  throw new Error(`GitHub: unsupported user operation "${operation}"`);
}

async function runWorkflowOperation(
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const own = owner(node, itemJson);
  const rep = repo(node, itemJson);
  if (!own || !rep)
    throw new Error("GitHub: owner and repository are required for workflow operations");
  const workflowId = String(resolveValue(node.parameters.workflowId, itemJson) ?? "");
  if (!workflowId && operation !== "getAll") throw new Error("GitHub: workflowId is required");

  if (operation === "disable") {
    const res = await githubRequest(
      baseUrl,
      "PUT",
      `repos/${own}/${rep}/actions/workflows/${workflowId}/disable`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "dispatch") {
    const ref = String(resolveValue(node.parameters.dispatchRef, itemJson) ?? "main");
    const inputsRaw = resolveValue(node.parameters.dispatchInputs, itemJson);
    const payload: Record<string, unknown> = { ref };
    if (inputsRaw && typeof inputsRaw === "object") {
      payload.inputs = inputsRaw;
    } else if (inputsRaw && typeof inputsRaw === "string") {
      try {
        payload.inputs = JSON.parse(inputsRaw);
      } catch {
        payload.inputs = inputsRaw;
      }
    }
    const res = await githubRequest(
      baseUrl,
      "POST",
      `repos/${own}/${rep}/actions/workflows/${workflowId}/dispatches`,
      payload,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "enable") {
    const res = await githubRequest(
      baseUrl,
      "PUT",
      `repos/${own}/${rep}/actions/workflows/${workflowId}/enable`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "get") {
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/actions/workflows/${workflowId}`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "getUsage") {
    const res = await githubRequest(
      baseUrl,
      "GET",
      `repos/${own}/${rep}/actions/workflows/${workflowId}/timing`,
      undefined,
      {},
      token,
    );
    return [asObj(res)];
  }

  if (operation === "getAll") {
    return githubGetAll(
      baseUrl,
      `repos/${own}/${rep}/actions/workflows`,
      {},
      token,
      node,
      itemJson,
    );
  }

  throw new Error(`GitHub: unsupported workflow operation "${operation}"`);
}

async function runOperation(
  node: { parameters: Record<string, unknown> },
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  if (resource === "file") return runFileOperation(node, operation, itemJson, baseUrl, token);
  if (resource === "issue") return runIssueOperation(node, operation, itemJson, baseUrl, token);
  if (resource === "organization")
    return runOrgOperation(node, operation, itemJson, baseUrl, token);
  if (resource === "release") return runReleaseOperation(node, operation, itemJson, baseUrl, token);
  if (resource === "repository") return runRepoOperation(node, operation, itemJson, baseUrl, token);
  if (resource === "review") return runReviewOperation(node, operation, itemJson, baseUrl, token);
  if (resource === "user") return runUserOperation(node, operation, itemJson, baseUrl, token);
  if (resource === "workflow")
    return runWorkflowOperation(node, operation, itemJson, baseUrl, token);
  throw new Error(`GitHub: unsupported resource "${resource}"`);
}

export const githubToolExecutor: NodeExecutor = async (ctx, node) => {
  const rawItems = ctx.getInputItems(0);
  if (rawItems.length === 0) {
    return emitToolHandle(ctx, {
      type: "n8n-nodes-base.githubTool",
      name: String(ctx.getParam("toolName", "github")),
      description: String(
        ctx.getParam(
          "description",
          "GitHub API: get/list files, repos, issues, and contents. Pass resource, operation, owner, repository, filePath.",
        ),
      ),
      schema: {
        type: "object",
        properties: {
          resource: { type: "string" },
          operation: { type: "string" },
          owner: { type: "string" },
          repository: { type: "string" },
          filePath: { type: "string" },
          branch: { type: "string" },
        },
      },
      async invoke(args: Record<string, unknown>) {
        const merged = { ...node.parameters, ...args };
        const { baseUrl, token } = await getCredential(ctx);
        assertAllowUrl(ctx, baseUrl);
        const resource = String(merged.resource ?? "file");
        const operation = String(merged.operation ?? "get");
        const results = await runOperation(
          { parameters: merged },
          resource,
          operation,
          args,
          baseUrl,
          token,
        );
        return { content: JSON.stringify(results) };
      },
    });
  }

  const items = ensureItems(rawItems);
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "issue");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const { baseUrl, token } = await getCredential(ctx);
      if (ctx.allowUrl && !ctx.allowUrl(baseUrl)) {
        throw new Error(`HTTP Request blocked by allowUrl policy: ${baseUrl}`);
      }
      const results = await runOperation(node, resource, operation, itemJson, baseUrl, token);
      for (const r of results) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err instanceof Error && "status" in err
          ? Number((err as Record<string, unknown>).status)
          : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};
