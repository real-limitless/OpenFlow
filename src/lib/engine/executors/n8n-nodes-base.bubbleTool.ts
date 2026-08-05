import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://{appname}.bubbleapps.io/api/1.1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function buildUrl(appName: string, env: string, typeName: string): string {
  const base = `https://${appName}.bubbleapps.io/api/1.1`;
  return `${base}/obj/${typeName}`;
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("bubbleApi");
  if (!cred) throw new Error("Bubble Tool: bubbleApi credential is required");
  const data = cred as Record<string, unknown>;
  const token = String(data.apiToken ?? data.apiKey ?? "");
  if (!token) throw new Error("Bubble Tool: API token not found in credential");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function bubbleRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
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
    } catch {}
    return { status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function requestOk(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await bubbleRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    const errBody = res.body as Record<string, unknown> | undefined;
    const message =
      typeof errBody?.message === "string"
        ? errBody.message
        : typeof errBody?.error === "string"
          ? errBody.error
          : `Bubble API: HTTP ${res.status}`;
    throw new Error(message);
  }
  if (res.body && typeof res.body === "object" && !Array.isArray(res.body)) {
    return res.body as Record<string, unknown>;
  }
  return { response: res.body };
}

function getEnv(cred: Record<string, unknown>): string {
  const env = String(cred.environment ?? "Development").toLowerCase();
  return env === "live" ? "live" : "version-test";
}

// --- operation runners ---

async function createObject(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  cred: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const typeName = String(resolveValue(node.parameters.typeName, itemJson) ?? "");
  if (!typeName) throw new Error("Bubble Tool: typeName is required for create");
  const appName = String(cred.appName ?? "");
  if (!appName) throw new Error("Bubble Tool: appName is required in credentials");
  const env = getEnv(cred);
  const fieldsRaw = resolveValue(node.parameters.fields, itemJson);
  const fields =
    typeof fieldsRaw === "string"
      ? JSON.parse(fieldsRaw)
      : (fieldsRaw as Record<string, unknown> ?? {});
  const url = `${buildUrl(appName, env, typeName)}`;
  const payload = fields;
  return requestOk("POST", url, headers, payload);
}

async function getObject(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  cred: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const typeName = String(resolveValue(node.parameters.typeName, itemJson) ?? "");
  if (!typeName) throw new Error("Bubble Tool: typeName is required for get");
  const objectId = String(resolveValue(node.parameters.objectId, itemJson) ?? "");
  if (!objectId) throw new Error("Bubble Tool: objectId is required for get");
  const appName = String(cred.appName ?? "");
  if (!appName) throw new Error("Bubble Tool: appName is required in credentials");
  const env = getEnv(cred);
  const url = `${buildUrl(appName, env, typeName)}/${objectId}`;
  return requestOk("GET", url, headers);
}

async function getAllObjects(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  cred: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const typeName = String(resolveValue(node.parameters.typeName, itemJson) ?? "");
  if (!typeName) throw new Error("Bubble Tool: typeName is required for getAll");
  const appName = String(cred.appName ?? "");
  if (!appName) throw new Error("Bubble Tool: appName is required in credentials");
  const env = getEnv(cred);
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 10);
  let url = `${buildUrl(appName, env, typeName)}`;
  if (!returnAll) {
    url += `?limit=${limit}`;
  }
  return requestOk("GET", url, headers);
}

async function updateObject(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  cred: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const typeName = String(resolveValue(node.parameters.typeName, itemJson) ?? "");
  if (!typeName) throw new Error("Bubble Tool: typeName is required for update");
  const objectId = String(resolveValue(node.parameters.objectId, itemJson) ?? "");
  if (!objectId) throw new Error("Bubble Tool: objectId is required for update");
  const appName = String(cred.appName ?? "");
  if (!appName) throw new Error("Bubble Tool: appName is required in credentials");
  const env = getEnv(cred);
  const fieldsRaw = resolveValue(node.parameters.fields, itemJson);
  const fields =
    typeof fieldsRaw === "string"
      ? JSON.parse(fieldsRaw)
      : (fieldsRaw as Record<string, unknown> ?? {});
  const url = `${buildUrl(appName, env, typeName)}/${objectId}`;
  return requestOk("PUT", url, headers, fields);
}

async function deleteObject(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  cred: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const typeName = String(resolveValue(node.parameters.typeName, itemJson) ?? "");
  if (!typeName) throw new Error("Bubble Tool: typeName is required for delete");
  const objectId = String(resolveValue(node.parameters.objectId, itemJson) ?? "");
  if (!objectId) throw new Error("Bubble Tool: objectId is required for delete");
  const appName = String(cred.appName ?? "");
  if (!appName) throw new Error("Bubble Tool: appName is required in credentials");
  const env = getEnv(cred);
  const url = `${buildUrl(appName, env, typeName)}/${objectId}`;
  await requestOk("DELETE", url, headers);
  return { success: true, deletedId: objectId };
}

export const bubbleToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "object");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  if (resource !== "object") {
    throw new Error(`Bubble Tool: unsupported resource "${resource}"`);
  }

  const cred = await ctx.getCredential("bubbleApi") as Record<string, unknown> | null;
  if (!cred) throw new Error("Bubble Tool: bubbleApi credential is required");
  const headers = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: Record<string, unknown>;
      switch (operation) {
        case "create":
          result = await createObject(node, itemJson, headers, cred);
          break;
        case "get":
          result = await getObject(node, itemJson, headers, cred);
          break;
        case "getAll":
          result = await getAllObjects(node, itemJson, headers, cred);
          break;
        case "update":
          result = await updateObject(node, itemJson, headers, cred);
          break;
        case "delete":
          result = await deleteObject(node, itemJson, headers, cred);
          break;
        default:
          throw new Error(`Bubble Tool: unsupported operation "${operation}"`);
      }
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out];
};
