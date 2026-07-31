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

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const n8nExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "workflow");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, statusCode: code } }, pairedItem });
    }
  }

  return [out];
};

async function getCredential(ctx: ExecutionContext): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  const cred = await ctx.getCredential("n8nApi");
  if (!cred) throw new Error("n8n: n8nApi credential is not configured");

  const credData = cred as Record<string, unknown>;
  const baseUrl = String(credData.baseUrl ?? "");
  const apiKey = String(credData.apiKey ?? "");

  if (!baseUrl) throw new Error("n8n: baseUrl is required in n8nApi credential");
  if (!apiKey) throw new Error("n8n: apiKey is required in n8nApi credential");

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json" },
  };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (resource === "audit") return runAuditOperation(ctx, node, operation, itemJson);
  if (resource === "credential") return runCredentialOperation(ctx, node, operation, itemJson);
  if (resource === "execution") return runExecutionOperation(ctx, node, operation, itemJson);
  if (resource === "workflow") return runWorkflowOperation(ctx, node, operation, itemJson);
  throw new Error(`n8n: unsupported resource "${resource}"`);
}

async function runAuditOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, headers } = await getCredential(ctx);

  if (operation === "generate") {
    const categories = resolveValue(node.parameters.categories, itemJson) as string[] | undefined;
    const daysAbandonedWorkflow = Number(resolveValue(node.parameters.daysAbandonedWorkflow, itemJson) ?? 90);
    const body: Record<string, unknown> = {};
    if (categories && categories.length > 0) body.categories = categories;
    body.daysAbandonedWorkflow = daysAbandonedWorkflow;
    const res = await n8nRequest(baseUrl, "POST", "audit/generate", body, headers);
    return { json: asObj(res) };
  }

  throw new Error(`n8n: unsupported audit operation "${operation}"`);
}

async function runCredentialOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, headers } = await getCredential(ctx);

  if (operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const credentialType = String(resolveValue(node.parameters.credentialType, itemJson) ?? "");
    const dataRaw = resolveValue(node.parameters.data, itemJson);
    let data: Record<string, unknown> = {};
    if (typeof dataRaw === "string") {
      try { data = JSON.parse(dataRaw); } catch { data = { raw: dataRaw }; }
    } else if (dataRaw && typeof dataRaw === "object") {
      data = dataRaw as Record<string, unknown>;
    }
    if (!name) throw new Error("n8n: name is required for credential create");
    if (!credentialType) throw new Error("n8n: credentialType is required for credential create");
    const res = await n8nRequest(baseUrl, "POST", "credentials", { name, type: credentialType, data }, headers);
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const credentialId = String(resolveValue(node.parameters.credentialId, itemJson) ?? "");
    if (!credentialId) throw new Error("n8n: credentialId is required for credential delete");
    const res = await n8nRequest(baseUrl, "DELETE", `credentials/${credentialId}`, undefined, headers);
    return { json: asObj(res) };
  }

  if (operation === "getSchema") {
    const credentialType = String(resolveValue(node.parameters.credentialType, itemJson) ?? "");
    if (!credentialType) throw new Error("n8n: credentialType is required for credential getSchema");
    const res = await n8nRequest(baseUrl, "GET", `credentials/schema/${credentialType}`, undefined, headers);
    return { json: asObj(res) };
  }

  throw new Error(`n8n: unsupported credential operation "${operation}"`);
}

async function runExecutionOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, headers } = await getCredential(ctx);

  if (operation === "get") {
    const executionId = String(resolveValue(node.parameters.executionId, itemJson) ?? "");
    if (!executionId) throw new Error("n8n: executionId is required for execution get");
    const includeDetails = Boolean(resolveValue(node.parameters.includeExecutionDetails, itemJson));
    const params = includeDetails ? "?includeData=true" : "";
    const res = await n8nRequest(baseUrl, "GET", `executions/${executionId}${params}`, undefined, headers);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    const status = resolveValue(filters.status, itemJson) as string | undefined;
    const workflow = resolveValue(filters.workflow, itemJson) as string | undefined;
    const includeDetails = Boolean(resolveValue(node.parameters.includeExecutionDetails, itemJson));
    const params = new URLSearchParams();
    if (!returnAll) params.set("limit", String(limit));
    if (status) params.set("status", status);
    if (workflow) params.set("workflowId", workflow);
    if (includeDetails) params.set("includeData", "true");
    const res = await n8nRequest(baseUrl, "GET", `executions?${params.toString()}`, undefined, headers);
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const executionId = String(resolveValue(node.parameters.executionId, itemJson) ?? "");
    if (!executionId) throw new Error("n8n: executionId is required for execution delete");
    const res = await n8nRequest(baseUrl, "DELETE", `executions/${executionId}`, undefined, headers);
    return { json: asObj(res) };
  }

  throw new Error(`n8n: unsupported execution operation "${operation}"`);
}

async function runWorkflowOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, headers } = await getCredential(ctx);

  if (operation === "create") {
    const workflowObjectRaw = resolveValue(node.parameters.workflowObject, itemJson);
    let workflowObject: Record<string, unknown> = {};
    if (typeof workflowObjectRaw === "string") {
      try { workflowObject = JSON.parse(workflowObjectRaw); } catch { workflowObject = { raw: workflowObjectRaw }; }
    } else if (workflowObjectRaw && typeof workflowObjectRaw === "object") {
      workflowObject = workflowObjectRaw as Record<string, unknown>;
    }
    if (!workflowObject.name) throw new Error("n8n: workflowObject must contain name");
    const res = await n8nRequest(baseUrl, "POST", "workflows", workflowObject, headers);
    return { json: asObj(res) };
  }

  if (operation === "get") {
    const workflowId = resolveResourceLocator(node.parameters.workflow, itemJson);
    if (!workflowId) throw new Error("n8n: workflow is required for workflow get");
    const res = await n8nRequest(baseUrl, "GET", `workflows/${workflowId}`, undefined, headers);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    const params = new URLSearchParams();
    if (!returnAll) params.set("limit", String(limit));
    const publishedOnly = resolveValue(filters.returnOnlyPublishedWorkflows, itemJson);
    if (publishedOnly) params.set("active", "true");
    const tags = resolveValue(filters.tags, itemJson);
    if (tags) params.set("tags", String(tags));
    const res = await n8nRequest(baseUrl, "GET", `workflows?${params.toString()}`, undefined, headers);
    return { json: asObj(res) };
  }

  if (operation === "update") {
    const workflowId = resolveResourceLocator(node.parameters.workflow, itemJson);
    if (!workflowId) throw new Error("n8n: workflow is required for workflow update");
    const workflowObjectRaw = resolveValue(node.parameters.workflowObject, itemJson);
    let workflowObject: Record<string, unknown> = {};
    if (typeof workflowObjectRaw === "string") {
      try { workflowObject = JSON.parse(workflowObjectRaw); } catch { workflowObject = { raw: workflowObjectRaw }; }
    } else if (workflowObjectRaw && typeof workflowObjectRaw === "object") {
      workflowObject = workflowObjectRaw as Record<string, unknown>;
    }
    const res = await n8nRequest(baseUrl, "PUT", `workflows/${workflowId}`, workflowObject, headers);
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const workflowId = resolveResourceLocator(node.parameters.workflow, itemJson);
    if (!workflowId) throw new Error("n8n: workflow is required for workflow delete");
    const res = await n8nRequest(baseUrl, "DELETE", `workflows/${workflowId}`, undefined, headers);
    return { json: asObj(res) };
  }

  if (operation === "activate") {
    const workflowId = resolveResourceLocator(node.parameters.workflow, itemJson);
    if (!workflowId) throw new Error("n8n: workflow is required for workflow activate");
    const res = await n8nRequest(baseUrl, "POST", `workflows/${workflowId}/activate`, undefined, headers);
    return { json: asObj(res) };
  }

  if (operation === "deactivate") {
    const workflowId = resolveResourceLocator(node.parameters.workflow, itemJson);
    if (!workflowId) throw new Error("n8n: workflow is required for workflow deactivate");
    const res = await n8nRequest(baseUrl, "POST", `workflows/${workflowId}/deactivate`, undefined, headers);
    return { json: asObj(res) };
  }

  throw new Error(`n8n: unsupported workflow operation "${operation}"`);
}

async function n8nRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const message = (obj.message as string) ?? `Request failed with status code ${response.status}`;
      const err = new Error(message);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed);
  } finally {
    clearTimeout(timer);
  }
}