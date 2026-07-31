import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE_CLOUD = "https://{instance}.atlassian.net/rest/api/2";
const API_BASE_SERVER = "{host}/rest/api/2";

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

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const jiraExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "issue");
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

async function getCredential(ctx: ExecutionContext, node: INode): Promise<{ baseUrl: string; auth: Record<string, string> }> {
  const jiraVersion = String(node.parameters.jiraVersion ?? "cloud");
  let credName = "jiraSoftwareCloudApi";
  if (jiraVersion === "server") credName = "jiraSoftwareServerApi";
  if (jiraVersion === "serverPat") credName = "jiraSoftwareServerPatApi";

  const cred = await ctx.getCredential(credName);
  if (!cred) throw new Error(`Jira: ${credName} credential is not configured`);

  const credData = cred as Record<string, unknown>;
  const instance = String(credData.instance ?? credData.domain ?? "");
  const host = String(credData.host ?? credData.url ?? "");
  const email = String(credData.email ?? credData.user ?? "");
  const apiToken = String(credData.apiToken ?? credData.password ?? credData.accessToken ?? "");
  const pat = String(credData.pat ?? credData.personalAccessToken ?? "");

  let baseUrl: string;
  if (jiraVersion === "cloud") {
    baseUrl = `https://${instance}.atlassian.net/rest/api/2`;
  } else {
    baseUrl = `${host}/rest/api/2`;
  }

  let auth: Record<string, string>;
  if (jiraVersion === "serverPat" && pat) {
    auth = { Authorization: `Bearer ${pat}` };
  } else {
    const encoded = Buffer.from(`${email}:${apiToken}`).toString("base64");
    auth = { Authorization: `Basic ${encoded}` };
  }

  return { baseUrl, auth };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  if (resource === "issue") return runIssueOperation(ctx, node, operation, itemJson, item);
  if (resource === "issueAttachment") return runIssueAttachmentOperation(ctx, node, operation, itemJson, item);
  if (resource === "issueComment") return runIssueCommentOperation(ctx, node, operation, itemJson);
  if (resource === "user") return runUserOperation(ctx, node, operation, itemJson);
  throw new Error(`Jira: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

async function runIssueOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx, node);

  if (operation === "create") {
    const project = String(resolveValue(node.parameters.project, itemJson) ?? "");
    const issuetype = String(resolveValue(node.parameters.issuetype, itemJson) ?? "");
    if (!project) throw new Error("Jira: project is required for issue create");
    if (!issuetype) throw new Error("Jira: issuetype is required for issue create");

    const fields: Record<string, unknown> = {
      project: { key: project },
      issuetype: { name: issuetype },
    };

    const summary = resolveValue(node.parameters.summary, itemJson);
    if (summary) fields.summary = String(summary);

    const description = resolveValue(node.parameters.description, itemJson);
    if (description) {
      if (typeof description === "string" && (description.startsWith("{") || description.startsWith("["))) {
        try { fields.description = JSON.parse(description); } catch { fields.description = description; }
      } else {
        fields.description = description;
      }
    }

    const priority = resolveValue(node.parameters.priority, itemJson);
    if (priority) fields.priority = { name: String(priority) };

    const labels = resolveValue(node.parameters.labels, itemJson);
    if (Array.isArray(labels)) fields.labels = labels;

    const assignee = resolveValue(node.parameters.assignee, itemJson);
    if (assignee) fields.assignee = { accountId: String(assignee) };

    const components = resolveValue(node.parameters.components, itemJson);
    if (Array.isArray(components)) fields.components = components.map((c: unknown) => typeof c === "string" ? { name: c } : c);

    const fixVersions = resolveValue(node.parameters.fixVersions, itemJson);
    if (Array.isArray(fixVersions)) fields.fixVersions = fixVersions.map((v: unknown) => typeof v === "string" ? { name: v } : v);

    const customFields = resolveValue(node.parameters.customFields, itemJson);
    if (customFields && typeof customFields === "object") {
      for (const [k, v] of Object.entries(customFields as Record<string, unknown>)) {
        fields[k] = v;
      }
    }

    const res = await jiraRequest(baseUrl, "POST", "issue", { fields }, {}, auth);
    return { json: { id: String(res.id ?? ""), key: String(res.key ?? ""), self: String(res.self ?? "") } };
  }

  if (operation === "get") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for issue get");
    const fields = resolveValue(node.parameters.fields, itemJson);
    const params: Record<string, string> = {};
    if (Array.isArray(fields) && fields.length > 0) params.fields = fields.join(",");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}`, undefined, params, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const jql = String(resolveValue(node.parameters.jql, itemJson) ?? "");
    if (!jql) throw new Error("Jira: jql is required for issue getAll");
    const returnAll = Boolean(node.parameters.returnAll);
    const maxResults = Number(node.parameters.maxResults ?? 50);
    const startAt = Number(node.parameters.startAt ?? 0);
    const fields = resolveValue(node.parameters.fields, itemJson);
    const params: Record<string, string> = { jql, maxResults: String(returnAll ? 100 : maxResults), startAt: String(startAt) };
    if (Array.isArray(fields) && fields.length > 0) params.fields = fields.join(",");
    const res = await jiraRequest(baseUrl, "GET", "search", undefined, params, auth);
    return { json: asObj(res) };
  }

  if (operation === "update") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for issue update");
    const fields: Record<string, unknown> = {};
    const summary = resolveValue(node.parameters.summary, itemJson);
    if (summary) fields.summary = String(summary);
    const description = resolveValue(node.parameters.description, itemJson);
    if (description) {
      if (typeof description === "string" && (description.startsWith("{") || description.startsWith("["))) {
        try { fields.description = JSON.parse(description); } catch { fields.description = description; }
      } else {
        fields.description = description;
      }
    }
    const priority = resolveValue(node.parameters.priority, itemJson);
    if (priority) fields.priority = { name: String(priority) };
    const labels = resolveValue(node.parameters.labels, itemJson);
    if (Array.isArray(labels)) fields.labels = labels;
    const assignee = resolveValue(node.parameters.assignee, itemJson);
    if (assignee) fields.assignee = { accountId: String(assignee) };
    const body: Record<string, unknown> = { fields };
    const transitionId = resolveValue(node.parameters.transitionId, itemJson);
    if (transitionId) body.transition = { id: String(transitionId) };
    await jiraRequest(baseUrl, "PUT", `issue/${issueKey}`, body, {}, auth);
    return { json: { success: true } };
  }

  if (operation === "delete") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for issue delete");
    await jiraRequest(baseUrl, "DELETE", `issue/${issueKey}`, undefined, {}, auth);
    return { json: { success: true } };
  }

  if (operation === "changelog") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for issue changelog");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}/changelog`, undefined, {}, auth);
    const values = (res.values ?? []) as Record<string, unknown>[];
    return values.map((v) => ({ json: v }));
  }

  if (operation === "transitions") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for issue transitions");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}/transitions`, undefined, {}, auth);
    const transitions = (res.transitions ?? []) as Record<string, unknown>[];
    return transitions.map((t) => ({ json: t }));
  }

  if (operation === "notify") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for issue notify");
    const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {};
    const textBody = resolveValue(additionalFields.textBody, itemJson) ?? "";
    const htmlBody = resolveValue(additionalFields.htmlBody, itemJson) ?? "";
    body.textBody = String(textBody);
    if (htmlBody) body.htmlBody = String(htmlBody);
    const subject = resolveValue(additionalFields.subject, itemJson);
    if (subject) body.subject = String(subject);
    const recipients: Record<string, unknown> = {};
    const assigneeNotify = additionalFields.notifyAssignee;
    if (assigneeNotify !== false) recipients.assignee = true;
    const reporterNotify = additionalFields.notifyReporter;
    if (reporterNotify) recipients.reporter = true;
    const watchersNotify = additionalFields.notifyWatchers;
    if (watchersNotify) recipients.watchers = true;
    body.to = recipients;
    await jiraRequest(baseUrl, "POST", `issue/${issueKey}/notify`, body, {}, auth);
    return { json: {} };
  }

  throw new Error(`Jira: unsupported issue operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Issue Attachment
// ---------------------------------------------------------------------------

async function runIssueAttachmentOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx, node);

  if (operation === "add") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for attachment add");
    const binaryPropertyName = String(node.parameters.binaryPropertyName ?? "data");
    const binary = item.binary?.[binaryPropertyName];
    if (!binary) throw new Error("Jira: binary data is required for attachment add");
    const form = new FormData();
    const bytes = Uint8Array.from(atob(binary.data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: binary.mimeType ?? "application/octet-stream" });
    form.append("file", blob, binary.fileName ?? "file");
    const res = await jiraRequestForm(baseUrl, `issue/${issueKey}/attachments`, form, auth);
    const list = Array.isArray(res) ? res : [res];
    return list.map((a: unknown) => ({ json: asObj(a) }));
  }

  if (operation === "get") {
    const attachmentId = resolveResourceLocator(node.parameters.attachmentId, itemJson);
    if (!attachmentId) throw new Error("Jira: attachmentId is required");
    const res = await jiraRequest(baseUrl, "GET", `attachment/${attachmentId}`, undefined, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for attachment getAll");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}`, undefined, { fields: "attachment" }, auth);
    const fields = asObj(res).fields as Record<string, unknown> | undefined;
    const attachments = (fields?.attachment ?? []) as Record<string, unknown>[];
    return attachments.map((a) => ({ json: a }));
  }

  if (operation === "remove") {
    const attachmentId = resolveResourceLocator(node.parameters.attachmentId, itemJson);
    if (!attachmentId) throw new Error("Jira: attachmentId is required");
    await jiraRequest(baseUrl, "DELETE", `attachment/${attachmentId}`, undefined, {}, auth);
    return { json: { success: true } };
  }

  throw new Error(`Jira: unsupported attachment operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Issue Comment
// ---------------------------------------------------------------------------

async function runIssueCommentOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx, node);

  if (operation === "add") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for comment add");
    const comment = String(resolveValue(node.parameters.comment, itemJson) ?? "");
    if (!comment) throw new Error("Jira: comment body is required");
    const body: Record<string, unknown> = { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] } };
    const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    const visibility = additionalFields.visibility as Record<string, unknown> | undefined;
    if (visibility?.type && visibility?.value) {
      body.visibility = { type: String(visibility.type), value: String(visibility.value) };
    }
    const res = await jiraRequest(baseUrl, "POST", `issue/${issueKey}/comment`, body, {}, auth);
    return { json: { id: String(res.id ?? ""), author: res.author, body: res.body, created: res.created, updated: res.updated, jsdPublic: res.jsdPublic ?? false, self: String(res.self ?? "") } };
  }

  if (operation === "get") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    const commentId = resolveResourceLocator(node.parameters.commentId, itemJson);
    if (!issueKey || !commentId) throw new Error("Jira: issueKey and commentId are required");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}/comment/${commentId}`, undefined, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    if (!issueKey) throw new Error("Jira: issueKey is required for comment getAll");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}/comment`, undefined, {}, auth);
    const comments = (res.comments ?? []) as Record<string, unknown>[];
    return comments.map((c) => ({ json: c }));
  }

  if (operation === "update") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    const commentId = resolveResourceLocator(node.parameters.commentId, itemJson);
    if (!issueKey || !commentId) throw new Error("Jira: issueKey and commentId are required");
    const comment = String(resolveValue(node.parameters.comment, itemJson) ?? "");
    if (!comment) throw new Error("Jira: comment body is required");
    const body: Record<string, unknown> = { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] } };
    const res = await jiraRequest(baseUrl, "PUT", `issue/${issueKey}/comment/${commentId}`, body, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "remove") {
    const issueKey = resolveResourceLocator(node.parameters.issueKey, itemJson);
    const commentId = resolveResourceLocator(node.parameters.commentId, itemJson);
    if (!issueKey || !commentId) throw new Error("Jira: issueKey and commentId are required");
    await jiraRequest(baseUrl, "DELETE", `issue/${issueKey}/comment/${commentId}`, undefined, {}, auth);
    return { json: { success: true } };
  }

  throw new Error(`Jira: unsupported comment operation "${operation}"`);
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
  const { baseUrl, auth } = await getCredential(ctx, node);

  if (operation === "get") {
    const accountId = resolveResourceLocator(node.parameters.accountId, itemJson);
    if (!accountId) throw new Error("Jira: accountId is required for user get");
    const res = await jiraRequest(baseUrl, "GET", `user?accountId=${encodeURIComponent(accountId)}`, undefined, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "create") {
    const emailAddress = String(resolveValue(node.parameters.emailAddress, itemJson) ?? "");
    const displayName = String(resolveValue(node.parameters.displayName, itemJson) ?? "");
    if (!emailAddress || !displayName) throw new Error("Jira: emailAddress and displayName are required for user create");
    const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = { emailAddress, displayName };
    const products = resolveValue(additionalFields.products, itemJson);
    if (Array.isArray(products)) body.products = products;
    if (additionalFields.notification !== undefined) body.notification = Boolean(additionalFields.notification);
    const res = await jiraRequest(baseUrl, "POST", "user", body, {}, auth);
    return { json: { accountId: String(res.accountId ?? ""), ...asObj(res) } };
  }

  if (operation === "delete") {
    const accountId = resolveResourceLocator(node.parameters.accountId, itemJson);
    if (!accountId) throw new Error("Jira: accountId is required for user delete");
    await jiraRequest(baseUrl, "DELETE", `user?accountId=${encodeURIComponent(accountId)}`, undefined, {}, auth);
    return { json: { success: true } };
  }

  throw new Error(`Jira: unsupported user operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function jiraRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
  auth?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${baseUrl}/${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      ...auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
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
      const obj = asObj(parsed);
      const errMessages = (obj.errorMessages as string[]) ?? [];
      const errMsg = errMessages.length > 0 ? errMessages.join("; ") : (obj.error as string) ?? `Request failed with status code ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed);
  } finally {
    clearTimeout(timer);
  }
}

async function jiraRequestForm(
  baseUrl: string,
  path: string,
  form: FormData,
  auth?: Record<string, string>,
): Promise<unknown> {
  const url = `${baseUrl}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const headers: Record<string, string> = {
      ...auth,
      Accept: "application/json",
      "X-Atlassian-Token": "no-check",
    };
    const response = await fetch(url, { method: "POST", headers, body: form, signal: controller.signal });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const errMessages = (obj.errorMessages as string[]) ?? [];
      const errMsg = errMessages.length > 0 ? errMessages.join("; ") : `Request failed with status code ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}