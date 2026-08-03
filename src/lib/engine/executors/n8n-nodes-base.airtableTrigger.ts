import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.airtable.com/v0";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveString(raw: unknown, itemJson: Record<string, unknown>): string {
  return String(resolveValue(raw, itemJson) ?? "");
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function processAirtableError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const err = obj.error;
  let message = `Airtable: HTTP ${status}`;
  if (typeof err === "string") {
    message = `Airtable: ${err}`;
  } else if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const type = e.type ? String(e.type) : "";
    const msg = e.message ? String(e.message) : "";
    message = type && msg ? `Airtable: ${type} \u2014 ${msg}` : `Airtable: ${msg || type || status}`;
  }
  return new Error(message);
}

async function fetchBinary(
  url: string,
  headers: Record<string, string>,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type") || "application/octet-stream";
    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return { data: base64, mimeType };
  } catch {
    return null;
  }
}

async function downloadAttachmentsForItem(
  fields: Record<string, unknown>,
  downloadFieldNames: string[],
  headers: Record<string, string>,
): Promise<Record<string, IBinaryData>> {
  const binary: Record<string, IBinaryData> = {};
  for (const fieldName of downloadFieldNames) {
    const attachments = fields[fieldName];
    if (!Array.isArray(attachments) || attachments.length === 0) continue;
    for (const att of attachments) {
      if (typeof att !== "object" || att === null) continue;
      const a = att as Record<string, unknown>;
      const url = a.url;
      if (typeof url !== "string" || !url) continue;
      const result = await fetchBinary(url, headers);
      if (result) {
        binary[fieldName] = {
          data: result.data,
          mimeType: result.mimeType,
          fileName: String(a.filename ?? ""),
        };
        break;
      }
    }
  }
  return binary;
}

async function airtableRequest(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Airtable request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  // Try Personal Access Token first, fall back to OAuth2, then legacy token
  let cred = await ctx.getCredential("airtableApi");
  let token: string | undefined;
  if (cred) {
    token = String(cred.accessToken ?? cred.token ?? "");
  }
  if (!token) {
    cred = await ctx.getCredential("airtableOAuth2Api");
    if (cred) {
      token = String(cred.accessToken ?? cred.token ?? "");
    }
  }
  if (!token) {
    cred = await ctx.getCredential("airtableTokenApi");
    if (cred) {
      token = String(cred.apiKey ?? cred.token ?? "");
    }
  }
  if (!token) {
    throw new Error("Airtable: no valid Airtable credential configured");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function encodeQuery(params: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function extractRecordFields(
  record: Record<string, unknown>,
  requestedFields: string[],
): Record<string, unknown> {
  const fields = (record.fields as Record<string, unknown>) ?? {};
  const id = record.id;
  const out: Record<string, unknown> = {};
  for (const f of requestedFields) {
    if (f in fields) out[f] = fields[f];
  }
  if (id) out.id = id;
  return out;
}

export const airtableTriggerExecutor: NodeExecutor = async (ctx, node) => {
  const params = node.parameters;
  const additionalFields = (params.additionalFields as Record<string, unknown>) ?? {};
  const downloadAttachments = params.downloadAttachments === true;
  const downloadFieldsRaw = String(params.downloadFields ?? "");

  const triggerItem = { json: {} };

  const base = resolveString(params.base, triggerItem.json);
  const table = resolveString(params.table, triggerItem.json);
  const triggerField = resolveString(params.triggerField, triggerItem.json);
  const fieldsRaw = resolveString(additionalFields.fields, triggerItem.json);
  const formulaRaw = resolveString(additionalFields.formula, triggerItem.json);
  const viewId = resolveString(additionalFields.viewId, triggerItem.json);

  if (!base || !table || !triggerField) {
    throw new Error("Airtable: base, table, and triggerField are required");
  }

  const headers = await authHeaders(ctx);
  const includedFields = fieldsRaw
    ? fieldsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  // Check if this is a manual execution by looking for a flag in customData
  const isManual = ctx.getCustomData("_isManualExecution") === "true";
  const lastPollTimestamp = ctx.getCustomData("_lastPollTimestamp");

  let filterByFormula: string | undefined;
  const timeFilterParts: string[] = [];

  if (lastPollTimestamp) {
    timeFilterParts.push(
      `IS_AFTER({${triggerField}}, DATETIME_PARSE("${lastPollTimestamp}", "YYYY-MM-DD HH:mm:ss"))`,
    );
  }

  // User formula applies only on production (non-manual) runs
  if (formulaRaw && !isManual) {
    timeFilterParts.push(formulaRaw);
  }

  if (timeFilterParts.length > 0) {
    filterByFormula = timeFilterParts.length === 1
      ? timeFilterParts[0]
      : `AND(${timeFilterParts.join(", ")})`;
  }

  const downloadFieldNames = downloadAttachments && downloadFieldsRaw
    ? downloadFieldsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const fieldsList: string[] = includedFields ? [...includedFields] : [triggerField];
  if (!fieldsList.includes(triggerField)) fieldsList.push(triggerField);
  for (const df of downloadFieldNames) {
    if (!fieldsList.includes(df)) fieldsList.push(df);
  }

  const params_qs: Record<string, string | undefined> = {};
  if (filterByFormula) params_qs.filterByFormula = filterByFormula;
  if (viewId) params_qs.view = viewId;
  for (let i = 0; i < fieldsList.length; i++) {
    params_qs[`fields[${i}]`] = fieldsList[i];
  }
  params_qs.pageSize = "100";

  let offset: string | undefined;
  const allRecords: Record<string, unknown>[] = [];
  const basePath = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;

  for (;;) {
    if (offset) params_qs.offset = offset;
    const qs = encodeQuery(params_qs);
    const res = await airtableRequest(`${basePath}${qs}`, headers);
    if (res.status < 200 || res.status >= 300) {
      throw processAirtableError(res.body, res.status);
    }
    const obj = asObj(res.body);
    const records = Array.isArray(obj.records)
      ? (obj.records as Record<string, unknown>[])
      : [];
    for (const rec of records) {
      allRecords.push(rec);
    }
    offset = typeof obj.offset === "string" ? obj.offset : undefined;
    if (!offset) break;
  }

  const out: INodeExecutionData[] = [];
  for (const rec of allRecords) {
    const fields = (rec.fields as Record<string, unknown>) ?? {};
    const json = extractRecordFields(rec, fieldsList);
    const item: INodeExecutionData = { json };
    if (downloadFieldNames.length > 0) {
      const binary = await downloadAttachmentsForItem(fields, downloadFieldNames, headers);
      if (Object.keys(binary).length > 0) {
        item.binary = binary;
      }
    }
    out.push(item);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  ctx.setCustomData("_lastPollTimestamp", `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`);

  return [out];
};
