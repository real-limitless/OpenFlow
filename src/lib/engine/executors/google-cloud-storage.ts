import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const GCS_API = "https://storage.googleapis.com/storage/v1";
const GCS_UPLOAD_API = "https://storage.googleapis.com/upload/storage/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
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

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("googleCloudStorageOAuth2Api");
  if (!cred) {
    throw new Error("GoogleCloudStorage: googleCloudStorageOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("GoogleCloudStorage: credential has no accessToken");
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
  contentType?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  } else if (body !== undefined && !(body instanceof ArrayBuffer || body instanceof Uint8Array)) {
    headers["Content-Type"] = "application/json";
    headers["Accept"] = "application/json";
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
      init.body = body as BodyInit;
    } else {
      init.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleCloudStorage: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function bucketCreate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const projectId = resolveLocator(node.parameters.projectId, itemJson);
  const name = resolveLocator(node.parameters.name, itemJson);
  const bucketType = resolveLocator(node.parameters.bucketType, itemJson);
  const predefinedAcl = resolveLocator(node.parameters.predefinedAcl, itemJson);

  const body: Record<string, unknown> = { name };
  if (bucketType) {
    body.storageClass = bucketType;
  }
  const qs = buildQueryString({ project: projectId, predefinedAcl: predefinedAcl || undefined });
  const { body: resp } = await apiRequest("POST", `${GCS_API}/b${qs}`, token, body);
  return { json: asObj(resp) };
}

async function bucketDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
  inputItem: INodeExecutionData,
): Promise<INodeExecutionData> {
  const name = resolveLocator(node.parameters.name, itemJson);
  await apiRequest("DELETE", `${GCS_API}/b/${encodeURIComponent(name)}`, token);
  return { json: { ...inputItem.json } };
}

async function bucketGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const name = resolveLocator(node.parameters.name, itemJson);
  const { body: resp } = await apiRequest("GET", `${GCS_API}/b/${encodeURIComponent(name)}`, token);
  return { json: asObj(resp) };
}

async function bucketGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const projectId = resolveLocator(node.parameters.projectId, itemJson);
  const maxResults = resolveLocator(node.parameters.maxResults, itemJson);
  const pageToken = resolveLocator(node.parameters.pageToken, itemJson);
  const qs = buildQueryString({
    project: projectId,
    maxResults: maxResults || undefined,
    pageToken: pageToken || undefined,
  });
  const { body: resp } = await apiRequest("GET", `${GCS_API}/b${qs}`, token);
  return { json: asObj(resp) };
}

async function bucketUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const name = resolveLocator(node.parameters.name, itemJson);
  const bucketType = resolveLocator(node.parameters.bucketType, itemJson);
  const body: Record<string, unknown> = {};
  if (bucketType) {
    body.storageClass = bucketType;
  }
  const { body: resp } = await apiRequest("PUT", `${GCS_API}/b/${encodeURIComponent(name)}`, token, body);
  return { json: asObj(resp) };
}

async function objectCreate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
  inputItem: INodeExecutionData,
): Promise<INodeExecutionData> {
  const bucketName = resolveLocator(node.parameters.bucketName, itemJson);
  const objectName = resolveLocator(node.parameters.objectName, itemJson);
  const binaryData = node.parameters.binaryData === true;
  const binaryPropertyName = String(node.parameters.binaryPropertyName ?? "data");
  const dataStr = resolveLocator(node.parameters.data, itemJson);
  const contentType = resolveLocator(node.parameters.contentType, itemJson);
  const predefinedAcl = resolveLocator(node.parameters.predefinedAcl, itemJson);

  let body: BodyInit | undefined;
  let mimeType = contentType || "application/octet-stream";

  if (binaryData && inputItem.binary) {
    const bin = inputItem.binary[binaryPropertyName];
    if (bin) {
      if (bin.data) {
        body = Uint8Array.from(atob(bin.data), (c) => c.charCodeAt(0));
      }
      if (bin.mimeType && !contentType) {
        mimeType = bin.mimeType;
      }
    }
  } else if (dataStr) {
    body = dataStr;
    if (!contentType) {
      mimeType = "text/plain";
    }
  }

  const qs = buildQueryString({
    uploadType: "media",
    name: objectName,
    predefinedAcl: predefinedAcl || undefined,
  });
  const { body: resp } = await apiRequest(
    "POST",
    `${GCS_UPLOAD_API}/b/${encodeURIComponent(bucketName)}/o${qs}`,
    token,
    body,
    mimeType,
  );
  return { json: asObj(resp) };
}

async function objectDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
  inputItem: INodeExecutionData,
): Promise<INodeExecutionData> {
  const bucketName = resolveLocator(node.parameters.bucketName, itemJson);
  const objectName = resolveLocator(node.parameters.objectName, itemJson);
  await apiRequest(
    "DELETE",
    `${GCS_API}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`,
    token,
  );
  return { json: { ...inputItem.json } };
}

async function objectGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const bucketName = resolveLocator(node.parameters.bucketName, itemJson);
  const objectName = resolveLocator(node.parameters.objectName, itemJson);
  const { body: resp } = await apiRequest(
    "GET",
    `${GCS_API}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`,
    token,
  );
  return { json: asObj(resp) };
}

async function objectGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const bucketName = resolveLocator(node.parameters.bucketName, itemJson);
  const prefix = resolveLocator(node.parameters.prefix, itemJson);
  const delimiter = resolveLocator(node.parameters.delimiter, itemJson);
  const maxResults = resolveLocator(node.parameters.maxResults, itemJson);
  const pageToken = resolveLocator(node.parameters.pageToken, itemJson);
  const qs = buildQueryString({
    prefix: prefix || undefined,
    delimiter: delimiter || undefined,
    maxResults: maxResults || undefined,
    pageToken: pageToken || undefined,
  });
  const { body: resp } = await apiRequest(
    "GET",
    `${GCS_API}/b/${encodeURIComponent(bucketName)}/o${qs}`,
    token,
  );
  return { json: asObj(resp) };
}

async function objectUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const bucketName = resolveLocator(node.parameters.bucketName, itemJson);
  const objectName = resolveLocator(node.parameters.objectName, itemJson);
  const contentType = resolveLocator(node.parameters.contentType, itemJson);
  const body: Record<string, unknown> = {};
  if (contentType) {
    body.contentType = contentType;
  }
  const { body: resp } = await apiRequest(
    "PUT",
    `${GCS_API}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`,
    token,
    body,
  );
  return { json: asObj(resp) };
}

export const googleCloudStorageExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "bucket") ?? "bucket");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create");
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];
  const token = await getAccessToken(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    try {
      let result: INodeExecutionData;
      if (resource === "bucket") {
        switch (operation) {
          case "create":
            result = await bucketCreate(node, itemJson, token);
            break;
          case "delete":
            result = await bucketDelete(node, itemJson, token, item);
            break;
          case "get":
            result = await bucketGet(node, itemJson, token);
            break;
          case "getAll":
            result = await bucketGetAll(node, itemJson, token);
            break;
          case "update":
            result = await bucketUpdate(node, itemJson, token);
            break;
          default:
            throw new Error(`GoogleCloudStorage: unknown bucket operation "${operation}"`);
        }
      } else if (resource === "object") {
        switch (operation) {
          case "create":
            result = await objectCreate(node, itemJson, token, item);
            break;
          case "delete":
            result = await objectDelete(node, itemJson, token, item);
            break;
          case "get":
            result = await objectGet(node, itemJson, token);
            break;
          case "getAll":
            result = await objectGetAll(node, itemJson, token);
            break;
          case "update":
            result = await objectUpdate(node, itemJson, token);
            break;
          default:
            throw new Error(`GoogleCloudStorage: unknown object operation "${operation}"`);
        }
      } else {
        throw new Error(`GoogleCloudStorage: unknown resource "${resource}"`);
      }
      out.push({ json: result.json, pairedItem: { item: idx, input: 0 } });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem: { item: idx, input: 0 } });
    }
  }

  return [out];
};