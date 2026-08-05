import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE_CLOUD = "https://{instance}.atlassian.net/rest/api/2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  return raw;
}

function resolveResourceLocator(raw: unknown, _itemJson: Record<string, unknown>): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "value" in raw) {
    return String((raw as Record<string, unknown>).value ?? "");
  }
  return String(raw ?? "");
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

export const jiraToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(ctx.getParam("resource", "issue"));
  const operation = String(ctx.getParam("operation", "get"));
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

async function getCredential(ctx: ExecutionContext, _node: INode): Promise<{ baseUrl: string; auth: Record<string, string> }> {
  const credName = "jiraSoftwareCloudApi";
  const cred = await ctx.getCredential(credName);
  if (!cred) throw new Error(`Jira Tool: ${credName} credential is not configured`);

  const credData = cred as Record<string, unknown>;
  const instance = String(credData.instance ?? credData.domain ?? "");
  const email = String(credData.email ?? credData.user ?? "");
  const apiToken = String(credData.apiToken ?? credData.password ?? credData.accessToken ?? "");

  const baseUrl = `https://${instance}.atlassian.net/rest/api/2`;
  const encoded = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const auth = { Authorization: `Basic ${encoded}` };

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
  throw new Error(`Jira Tool: unsupported resource "${resource}"`);
}

async function runIssueOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx, node);

  if (operation === "create") {
    const project = String(resolveValue(ctx.getParam("project", ""), itemJson) ?? "");
    const issuetype = String(resolveValue(ctx.getParam("issueType", ""), itemJson) ?? "");
    if (!project) throw new Error("Jira Tool: project is required for issue create");
    if (!issuetype) throw new Error("Jira Tool: issuetype is required for issue create");

    const fields: Record<string, unknown> = {
      project: { key: project },
      issuetype: { name: issuetype },
    };

    const summary = resolveValue(ctx.getParam("summary", ""), itemJson);
    if (summary) fields.summary = String(summary);

    const description = resolveValue(ctx.getParam("description", ""), itemJson);
    if (description) {
      if (typeof description === "string" && (description.startsWith("{") || description.startsWith("["))) {
        try { fields.description = JSON.parse(description); } catch { fields.description = description; }
      } else {
        fields.description = description;
      }
    }

    const priority = resolveValue(ctx.getParam("priority", ""), itemJson);
    if (priority) fields.priority = { name: String(priority) };

    const labels = resolveValue(ctx.getParam("labels", ""), itemJson);
    if (Array.isArray(labels)) fields.labels = labels;

    const assignee = resolveValue(ctx.getParam("assignee", ""), itemJson);
    if (assignee) fields.assignee = { accountId: String(assignee) };

    const components = resolveValue(ctx.getParam("components", ""), itemJson);
    if (Array.isArray(components)) fields.components = components.map((c: unknown) => typeof c === "string" ? { name: c } : c);

    const customFields = resolveValue(ctx.getParam("customFields", ""), itemJson);
    if (customFields && typeof customFields === "object") {
      for (const [k, v] of Object.entries(customFields as Record<string, unknown>)) {
        fields[k] = v;
      }
    }

    const res = await jiraRequest(baseUrl, "POST", "issue", { fields }, {}, auth);
    return { json: { id: String(res.id ?? ""), key: String(res.key ?? ""), self: String(res.self ?? "") } };
  }

  if (operation === "get") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for issue get");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}`, undefined, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const options = (ctx.getParam("options", {}) ?? {}) as Record<string, unknown>;
    const jql = String(resolveValue(options.jql ?? ctx.getParam("jql", ""), itemJson) ?? "");
    if (!jql) throw new Error("Jira Tool: jql is required for issue getAll");
    const returnAll = Boolean(ctx.getParam("returnAll", false));
    const maxResults = Number(ctx.getParam("limit", 50));
    const fields = String(options.fields ?? "");
    const params: Record<string, string> = { jql, maxResults: String(returnAll ? 100 : maxResults) };
    if (fields) params.fields = fields;
    let allIssues: Record<string, unknown>[] = [];
    let startAt = 0;
    const pageSize = returnAll ? 100 : maxResults;
    do {
      params.maxResults = String(pageSize);
      params.startAt = String(startAt);
      const res = await jiraRequest(baseUrl, "GET", "search", undefined, params, auth);
      const issues = (res.issues ?? []) as Record<string, unknown>[];
      allIssues = allIssues.concat(issues);
      if (!returnAll || issues.length === 0) break;
      startAt += issues.length;
    } while (returnAll);
    return allIssues.map((issue) => ({ json: { id: String(issue.id ?? ""), key: String(issue.key ?? ""), fields: issue.fields } }));
  }

  if (operation === "update") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for issue update");
    const fields: Record<string, unknown> = {};
    const summary = resolveValue(ctx.getParam("summary", ""), itemJson);
    if (summary) fields.summary = String(summary);
    const description = resolveValue(ctx.getParam("description", ""), itemJson);
    if (description) {
      if (typeof description === "string" && (description.startsWith("{") || description.startsWith("["))) {
        try { fields.description = JSON.parse(description); } catch { fields.description = description; }
      } else {
        fields.description = description;
      }
    }
    const body: Record<string, unknown> = { fields };
    await jiraRequest(baseUrl, "PUT", `issue/${issueKey}`, body, {}, auth);
    return { json: { success: true } };
  }

  if (operation === "delete") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for issue delete");
    await jiraRequest(baseUrl, "DELETE", `issue/${issueKey}`, undefined, {}, auth);
    return { json: { success: true } };
  }

  if (operation === "changelog") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for issue changelog");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}/changelog`, undefined, {}, auth);
    const values = (res.values ?? []) as Record<string, unknown>[];
    return values.map((v) => ({ json: v }));
  }

  if (operation === "getTransitions") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for transitions");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}/transitions`, undefined, {}, auth);
    const transitions = (res.transitions ?? []) as Record<string, unknown>[];
    return transitions.map((t) => ({ json: t }));
  }

  if (operation === "notify") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for issue notify");
    const subject = String(resolveValue(ctx.getParam("subject", ""), itemJson) ?? "");
    const textBody = String(resolveValue(ctx.getParam("textBody", ""), itemJson) ?? "");
    const recipientsParam = (ctx.getParam("recipients", {}) ?? {}) as Record<string, unknown>;
    const to: Record<string, unknown> = {};
    for (const key of ["reporter", "assignee", "watchers", "voters"]) {
      if (recipientsParam[key]) to[key] = true;
    }
    const customUsers = recipientsParam.customUsers;
    if (Array.isArray(customUsers) && customUsers.length > 0) {
      to.users = customUsers;
    }
    const body: Record<string, unknown> = { subject, textBody, to };
    await jiraRequest(baseUrl, "POST", `issue/${issueKey}/notify`, body, {}, auth);
    return { json: { success: true } };
  }

  throw new Error(`Jira Tool: unsupported issue operation "${operation}"`);
}

async function runIssueAttachmentOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx, node);

  if (operation === "add") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for attachment add");
    const binaryPropertyName = String(ctx.getParam("binaryPropertyName", "data"));
    const binary = item.binary?.[binaryPropertyName];
    if (!binary) throw new Error("Jira Tool: binary data is required for attachment add");
    const form = new FormData();
    const bytes = Uint8Array.from(atob(binary.data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: binary.mimeType ?? "application/octet-stream" });
    form.append("file", blob, binary.fileName ?? "file");
    const res = await jiraRequestForm(baseUrl, `issue/${issueKey}/attachments`, form, auth);
    const list = Array.isArray(res) ? res : [res];
    return list.map((a: unknown) => ({ json: asObj(a) }));
  }

  if (operation === "get") {
    const attachmentId = resolveResourceLocator(ctx.getParam("attachmentId", ""), itemJson);
    if (!attachmentId) throw new Error("Jira Tool: attachmentId is required");
    const res = await jiraRequest(baseUrl, "GET", `attachment/${attachmentId}`, undefined, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for attachment getAll");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}`, undefined, { fields: "attachment" }, auth);
    const fields = asObj(res).fields as Record<string, unknown> | undefined;
    const attachments = (fields?.attachment ?? []) as Record<string, unknown>[];
    return attachments.map((a) => ({ json: a }));
  }

  if (operation === "remove") {
    const attachmentId = resolveResourceLocator(ctx.getParam("attachmentId", ""), itemJson);
    if (!attachmentId) throw new Error("Jira Tool: attachmentId is required");
    await jiraRequest(baseUrl, "DELETE", `attachment/${attachmentId}`, undefined, {}, auth);
    return { json: { success: true } };
  }

  throw new Error(`Jira Tool: unsupported attachment operation "${operation}"`);
}

async function runIssueCommentOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx, node);

  if (operation === "add") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for comment add");
    const comment = String(resolveValue(ctx.getParam("comment", ""), itemJson) ?? "");
    if (!comment) throw new Error("Jira Tool: comment body is required");
    const body: Record<string, unknown> = {
      body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] },
    };
    const visibility = ctx.getParam("visibility", undefined) as Record<string, unknown> | undefined;
    if (visibility?.type && visibility?.value) {
      body.visibility = { type: String(visibility.type), value: String(visibility.value) };
    }
    const res = await jiraRequest(baseUrl, "POST", `issue/${issueKey}/comment`, body, {}, auth);
    return { json: { id: String(res.id ?? ""), body: res.body, created: res.created, self: String(res.self ?? "") } };
  }

  if (operation === "get") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    const commentId = resolveResourceLocator(ctx.getParam("commentId", ""), itemJson);
    if (!issueKey || !commentId) throw new Error("Jira Tool: issueKey and commentId are required");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}/comment/${commentId}`, undefined, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    if (!issueKey) throw new Error("Jira Tool: issueId is required for comment getAll");
    const res = await jiraRequest(baseUrl, "GET", `issue/${issueKey}/comment`, undefined, {}, auth);
    const comments = (res.comments ?? []) as Record<string, unknown>[];
    return comments.map((c) => ({ json: c }));
  }

  if (operation === "update") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    const commentId = resolveResourceLocator(ctx.getParam("commentId", ""), itemJson);
    if (!issueKey || !commentId) throw new Error("Jira Tool: issueKey and commentId are required");
    const comment = String(resolveValue(ctx.getParam("comment", ""), itemJson) ?? "");
    if (!comment) throw new Error("Jira Tool: comment body is required");
    const body: Record<string, unknown> = {
      body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] },
    };
    const res = await jiraRequest(baseUrl, "PUT", `issue/${issueKey}/comment/${commentId}`, body, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "remove") {
    const issueKey = resolveResourceLocator(ctx.getParam("issueId", ""), itemJson);
    const commentId = resolveResourceLocator(ctx.getParam("commentId", ""), itemJson);
    if (!issueKey || !commentId) throw new Error("Jira Tool: issueKey and commentId are required");
    await jiraRequest(baseUrl, "DELETE", `issue/${issueKey}/comment/${commentId}`, undefined, {}, auth);
    return { json: { success: true } };
  }

  throw new Error(`Jira Tool: unsupported comment operation "${operation}"`);
}

async function runUserOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx, node);

  if (operation === "get") {
    const accountId = resolveResourceLocator(ctx.getParam("accountId", ""), itemJson);
    if (!accountId) throw new Error("Jira Tool: accountId is required for user get");
    const res = await jiraRequest(baseUrl, "GET", `user?accountId=${encodeURIComponent(accountId)}`, undefined, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "create") {
    const emailAddress = String(resolveValue(ctx.getParam("emailAddress", ""), itemJson) ?? "");
    const displayName = String(resolveValue(ctx.getParam("displayName", ""), itemJson) ?? "");
    if (!emailAddress || !displayName) throw new Error("Jira Tool: emailAddress and displayName are required for user create");
    const body: Record<string, unknown> = { emailAddress, displayName };
    const products = resolveValue(ctx.getParam("products", ""), itemJson);
    if (Array.isArray(products)) body.products = products;
    const notification = ctx.getParam("notification", undefined);
    if (notification !== undefined) body.notification = Boolean(notification);
    const res = await jiraRequest(baseUrl, "POST", "user", body, {}, auth);
    return { json: { accountId: String(res.accountId ?? ""), ...asObj(res) } };
  }

  if (operation === "delete") {
    const accountId = resolveResourceLocator(ctx.getParam("accountId", ""), itemJson);
    if (!accountId) throw new Error("Jira Tool: accountId is required for user delete");
    await jiraRequest(baseUrl, "DELETE", `user?accountId=${encodeURIComponent(accountId)}`, undefined, {}, auth);
    return { json: { success: true } };
  }

  throw new Error(`Jira Tool: unsupported user operation "${operation}"`);
}

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
      const obj = asObj(parsed as Record<string, unknown>);
      const errMessages = (obj.errorMessages as string[]) ?? [];
      const errMsg = errMessages.length > 0 ? errMessages.join("; ") : (obj.error as string) ?? `Request failed with status code ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed as Record<string, unknown>);
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
