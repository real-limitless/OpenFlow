import type { NodeExecutor, INodeExecutionData, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://kf.kobotoolbox.org/api/v2";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

function resolveValue(raw: unknown): string {
  if (typeof raw !== "string") return String(raw ?? "");
  if (raw.startsWith("={{") && raw.endsWith("}}")) return "";
  return raw;
}

async function koboRequest(
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
  } catch (err) {
    throw new Error(`KoBoToolbox request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const detail = obj.detail ? String(obj.detail) : obj.error ? String(obj.error) : `HTTP ${status}`;
  return new Error(`KoBoToolbox: ${detail}`);
}

async function requestOk(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await koboRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status);
  return asObj(res.body);
}

async function authHeaders(node: INode): Promise<Record<string, string>> {
  const params = node.parameters as Record<string, unknown>;
  const token = params.token ? String(params.token) : "";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = `Token ${token}`;
  }
  headers["Content-Type"] = "application/json";
  return headers;
}

export const koBoToolboxToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = node.parameters as Record<string, unknown>;
  const resource = String(params.resource ?? "form");
  const operation = String(params.operation ?? "getMany");
  const continueOnFail = ctx.continueOnFail();
  const headers = await authHeaders(node);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runResource(resource, operation, params, headers);
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function runResource(
  resource: string,
  operation: string,
  params: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  switch (resource) {
    case "file": return runFile(operation, params, headers);
    case "form": return runForm(operation, params, headers);
    case "hook": return runHook(operation, params, headers);
    case "submission": return runSubmission(operation, params, headers);
    default: throw new Error(`KoBoToolbox: unsupported resource "${resource}"`);
  }
}

function formId(params: Record<string, unknown>): string {
  const id = resolveValue(params.formId);
  if (!id) throw new Error("KoBoToolbox: formId is required");
  return id;
}

async function runFile(
  operation: string,
  params: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const fid = formId(params);

  if (operation === "getMany") {
    return requestOk("GET", `${API_BASE}/assets/${fid}/files`, headers);
  }

  if (operation === "get") {
    const fileId = resolveValue(params.fileId);
    if (!fileId) throw new Error("KoBoToolbox: fileId is required");
    return requestOk("GET", `${API_BASE}/assets/${fid}/files/${fileId}`, headers);
  }

  if (operation === "create") {
    return requestOk("POST", `${API_BASE}/assets/${fid}/files`, headers, {});
  }

  if (operation === "delete") {
    const fileId = resolveValue(params.fileId);
    if (!fileId) throw new Error("KoBoToolbox: fileId is required");
    await requestOk("DELETE", `${API_BASE}/assets/${fid}/files/${fileId}`, headers);
    return {};
  }

  throw new Error(`KoBoToolbox: unsupported file operation "${operation}"`);
}

async function runForm(
  operation: string,
  params: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (operation === "getMany") {
    return requestOk("GET", `${API_BASE}/assets`, headers);
  }

  const fid = formId(params);

  if (operation === "get") {
    return requestOk("GET", `${API_BASE}/assets/${fid}`, headers);
  }

  if (operation === "redeploy") {
    return requestOk("PATCH", `${API_BASE}/assets/${fid}/deployment`, headers, { active: true });
  }

  throw new Error(`KoBoToolbox: unsupported form operation "${operation}"`);
}

async function runHook(
  operation: string,
  params: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const fid = formId(params);

  if (operation === "getMany") {
    return requestOk("GET", `${API_BASE}/assets/${fid}/hooks`, headers);
  }

  const hookId = resolveValue(params.hookId);

  if (operation === "get") {
    if (!hookId) throw new Error("KoBoToolbox: hookId is required");
    return requestOk("GET", `${API_BASE}/assets/${fid}/hooks/${hookId}`, headers);
  }

  if (operation === "logs") {
    if (!hookId) throw new Error("KoBoToolbox: hookId is required");
    return requestOk("GET", `${API_BASE}/assets/${fid}/hooks/${hookId}/logs`, headers);
  }

  if (operation === "retryAll") {
    return requestOk("POST", `${API_BASE}/assets/${fid}/hooks/retry`, headers, {});
  }

  if (operation === "retryOne") {
    if (!hookId) throw new Error("KoBoToolbox: hookId is required");
    return requestOk("PATCH", `${API_BASE}/assets/${fid}/hooks/${hookId}/retry`, headers, {});
  }

  throw new Error(`KoBoToolbox: unsupported hook operation "${operation}"`);
}

async function runSubmission(
  operation: string,
  params: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const fid = formId(params);

  if (operation === "getMany") {
    const url = new URL(`${API_BASE}/assets/${fid}/data`);
    const limit = Number(params.limit ?? 0);
    const start = Number(params.start ?? 0);
    if (limit > 0) url.searchParams.set("limit", String(limit));
    if (start > 0) url.searchParams.set("offset", String(start));
    if (params.query) url.searchParams.set("query", String(params.query));
    if (params.fields) url.searchParams.set("fields", String(params.fields));
    if (params.sort) url.searchParams.set("sort", String(params.sort));
    return requestOk("GET", url.toString(), headers);
  }

  const submissionId = resolveValue(params.submissionId);

  if (operation === "get") {
    if (!submissionId) throw new Error("KoBoToolbox: submissionId is required");
    let url = `${API_BASE}/assets/${fid}/data/${submissionId}`;
    if (params.reformat) {
      const qp = new URLSearchParams();
      qp.set("format", "json");
      if (params.numberMasks) qp.set("number_masks", String(params.numberMasks));
      if (params.multiselectMasks) qp.set("multi_select_masks", String(params.multiselectMasks));
      url += `?${qp.toString()}`;
    }
    return requestOk("GET", url, headers);
  }

  if (operation === "delete") {
    if (!submissionId) throw new Error("KoBoToolbox: submissionId is required");
    await requestOk("DELETE", `${API_BASE}/assets/${fid}/data/${submissionId}`, headers);
    return {};
  }

  if (operation === "getValidationStatus") {
    if (!submissionId) throw new Error("KoBoToolbox: submissionId is required");
    return requestOk("GET", `${API_BASE}/assets/${fid}/data/${submissionId}/validation_status`, headers);
  }

  if (operation === "updateValidationStatus") {
    if (!submissionId) throw new Error("KoBoToolbox: submissionId is required");
    const status = resolveValue(params.validationStatus);
    if (!status) throw new Error("KoBoToolbox: validationStatus is required");
    return requestOk(
      "PATCH",
      `${API_BASE}/assets/${fid}/data/${submissionId}/validation_status`,
      headers,
      { validation_status: status },
    );
  }

  throw new Error(`KoBoToolbox: unsupported submission operation "${operation}"`);
}
