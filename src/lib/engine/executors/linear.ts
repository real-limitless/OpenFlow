import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.linear.app/graphql";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function parseObjectParam(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function linearGraphql(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  return fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: controller.signal,
  })
    .then(async (res) => {
      const body = await res.json();
      clearTimeout(timer);
      if (body.errors) {
        const msgs = body.errors.map((e: { message: string }) => e.message).join("; ");
        throw new Error(`Linear: ${msgs}`);
      }
      return body.data ?? {};
    })
    .catch((err) => {
      clearTimeout(timer);
      throw err;
    });
}

export const linearExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const resource = String(node.parameters.resource ?? "issue");
  const operation = String(node.parameters.operation ?? "create");

  const apiCred = await ctx.getCredential("linearApi");
  const oauthCred = await ctx.getCredential("linearOAuth2Api");
  let token = "";
  if (apiCred && apiCred.apiKey) {
    token = String(apiCred.apiKey);
  } else if (oauthCred && oauthCred.accessToken) {
    token = String(oauthCred.accessToken);
  }
  if (!token) {
    throw new Error("Linear: credential with apiKey or accessToken is required");
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(resource, operation, node, itemJson, token);
      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r, pairedItem });
        }
      } else {
        out.push({ json: result, pairedItem });
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
  resource: string,
  operation: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (resource === "issue") {
    return runIssueOperation(operation, node, itemJson, token);
  }
  if (resource === "comment") {
    return runCommentOperation(operation, node, itemJson, token);
  }
  throw new Error(`Linear: unsupported resource "${resource}"`);
}

async function runIssueOperation(
  operation: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const issueFieldsRaw = node.parameters.issueFields;
    const issueFields = parseObjectParam(issueFieldsRaw);
    if (Object.keys(issueFields).length === 0) {
      throw new Error("Linear: issueFields are required for create");
    }
    const title = String(resolveValue(issueFields.title, itemJson) ?? "");
    if (!title) throw new Error("Linear: title is required in issueFields for create");
    const team = String(resolveValue(issueFields.team, itemJson) ?? "");
    if (!team) throw new Error("Linear: team is required in issueFields for create");
    const input: Record<string, unknown> = { title, teamId: team };
    const description = resolveValue(issueFields.description, itemJson);
    if (description) input.description = String(description);
    const priority = resolveValue(issueFields.priority, itemJson);
    if (priority !== undefined && priority !== "") input.priority = Number(priority);
    const assigneeId = resolveValue(issueFields.assigneeId, itemJson);
    if (assigneeId) input.assigneeId = String(assigneeId);
    const projectId = resolveValue(issueFields.projectId, itemJson);
    if (projectId) input.projectId = String(projectId);

    const data = await linearGraphql(
      token,
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id title description priority } } }`,
      { input },
    );
    const issue = (data.issueCreate as Record<string, unknown>)?.issue as Record<string, unknown> ?? {};
    return { id: String(issue.id ?? ""), title: String(issue.title ?? ""), ...issue };
  }

  if (operation === "get") {
    const issueId = String(resolveValue(node.parameters.issueIdentifier, itemJson) ?? "");
    if (!issueId) throw new Error("Linear: issueIdentifier is required for get");
    const data = await linearGraphql(
      token,
      `query($id: String!) { issue(id: $id) { id title description priority url } }`,
      { id: issueId },
    );
    return (data.issue as Record<string, unknown>) ?? {};
  }

  if (operation === "update") {
    const issueId = String(resolveValue(node.parameters.issueIdentifier, itemJson) ?? "");
    if (!issueId) throw new Error("Linear: issueIdentifier is required for update");
    const issueFieldsRaw = node.parameters.issueFields;
    const issueFields = parseObjectParam(issueFieldsRaw);
    const input: Record<string, unknown> = {};
    if (Object.keys(issueFields).length > 0) {
      const title = resolveValue(issueFields.title, itemJson);
      if (title) input.title = String(title);
      const description = resolveValue(issueFields.description, itemJson);
      if (description) input.description = String(description);
      const priority = resolveValue(issueFields.priority, itemJson);
      if (priority !== undefined && priority !== "") input.priority = Number(priority);
      const assigneeId = resolveValue(issueFields.assigneeId, itemJson);
      if (assigneeId) input.assigneeId = String(assigneeId);
    }
    const data = await linearGraphql(
      token,
      `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { issue { id title description priority } } }`,
      { id: issueId, input },
    );
    const issue = (data.issueUpdate as Record<string, unknown>)?.issue as Record<string, unknown> ?? {};
    return { id: String(issue.id ?? ""), ...issue };
  }

  if (operation === "delete") {
    const issueId = String(resolveValue(node.parameters.issueIdentifier, itemJson) ?? "");
    if (!issueId) throw new Error("Linear: issueIdentifier is required for delete");
    const data = await linearGraphql(
      token,
      `mutation($id: String!) { issueDelete(id: $id) { success } }`,
      { id: issueId },
    );
    const result = (data.issueDelete as Record<string, unknown>) ?? {};
    return { success: Boolean(result.success) };
  }

  if (operation === "addLink") {
    const issueId = String(resolveValue(node.parameters.issueIdentifier, itemJson) ?? "");
    if (!issueId) throw new Error("Linear: issueIdentifier is required for addLink");
    const linkUrl = String(resolveValue(node.parameters.link, itemJson) ?? "");
    if (!linkUrl) throw new Error("Linear: link is required for addLink");
    const data = await linearGraphql(
      token,
      `mutation($input: AttachmentCreateInput!) { attachmentCreate(input: $input) { attachment { id url title } } }`,
      { input: { issueId, url: linkUrl } },
    );
    const attachment = (data.attachmentCreate as Record<string, unknown>)?.attachment as Record<string, unknown> ?? {};
    return { ...attachment };
  }

  if (operation === "getAll") {
    const data = await linearGraphql(
      token,
      `query { issues { nodes { id title description priority url } } }`,
    );
    const issues = (data.issues as Record<string, unknown>)?.nodes as Record<string, unknown>[] ?? [];
    return issues.map((issue) => ({ ...issue }));
  }

  throw new Error(`Linear: unsupported issue operation "${operation}"`);
}

async function runCommentOperation(
  operation: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "addComment") {
    const issueId = String(resolveValue(node.parameters.issueIdentifier, itemJson) ?? "");
    if (!issueId) throw new Error("Linear: issueIdentifier is required for addComment");
    const body = String(resolveValue(node.parameters.commentBody, itemJson) ?? "");
    if (!body) throw new Error("Linear: commentBody is required for addComment");
    const input: Record<string, unknown> = { issueId, body };
    const parentId = String(resolveValue(node.parameters.parentCommentIdentifier, itemJson) ?? "");
    if (parentId) input.parentId = parentId;
    const data = await linearGraphql(
      token,
      `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id body } } }`,
      { input },
    );
    const comment = (data.commentCreate as Record<string, unknown>)?.comment as Record<string, unknown> ?? {};
    return { id: String(comment.id ?? ""), body: String(comment.body ?? ""), ...comment };
  }

  throw new Error(`Linear: unsupported comment operation "${operation}"`);
}