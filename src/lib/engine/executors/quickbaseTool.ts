import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
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

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

const QB_API = "https://api.quickbase.com/v1";

interface QBResponse {
  data?: unknown[];
  metadata?: Record<string, unknown>;
}

async function qbRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<QBResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${QB_API}${path}`, init);
    const text = await res.text();
    if (!res.ok) {
      let msg = `Quick Base API error: ${res.status}`;
      try {
        const err = text ? JSON.parse(text) : {};
        if (err && typeof err === "object") {
          msg = String((err as Record<string, unknown>).message ?? msg);
        }
      } catch {}
      throw new Error(msg);
    }
    return text ? JSON.parse(text) : {};
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Quick Base API error")) throw err;
    throw new Error(`Quick Base request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(credentials: Record<string, unknown>): Record<string, string> {
  const hostname = String(credentials.hostname ?? "");
  const userToken = String(credentials.userToken ?? "");
  return {
    "QB-Realm-Hostname": `${hostname}.quickbase.com`,
    "Authorization": `QB-USER-TOKEN ${userToken}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

function columnsToFields(columns: string, itemJson: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (!columns) return fields;
  const names = columns.split(",").map((c) => String(resolveValue(c.trim(), itemJson))).filter(Boolean);
  for (const name of names) {
    if (itemJson[name] !== undefined) {
      fields[name] = itemJson[name];
    }
  }
  return fields;
}

export const quickbaseToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "record");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("quickbaseApi");
  if (!cred) {
    const err = new Error("Quick Base API credentials are required");
    if (!continueOnFail) throw err;
    return [[{ json: { error: { message: err.message } } }]];
  }
  const headers = buildHeaders(cred);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOp(resource, operation, node, itemJson, headers);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      out.push({ json: { error: { message: err instanceof Error ? err.message : String(err) } }, pairedItem });
    }
  }

  return [out];
};

async function runOp(
  resource: string,
  operation: string,
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const p = node.parameters;
  const tableId = String(resolveValue(p.tableId ?? "", itemJson));

  switch (resource) {
    case "field": {
      if (operation === "getAll") {
        if (!tableId) throw new Error("tableId is required for field getAll");
        return qbRequest("GET", `/fields?tableId=${encodeURIComponent(tableId)}`, headers);
      }
      throw new Error(`Unsupported field operation: ${operation}`);
    }

    case "file": {
      const recordId = String(resolveValue(p.recordId ?? "", itemJson));
      const fieldId = String(resolveValue(p.fieldId ?? "", itemJson));
      const versionNumber = Number(p.versionNumber ?? 1);

      if (!tableId) throw new Error("tableId is required for file operations");
      if (!recordId) throw new Error("recordId is required for file operations");
      if (!fieldId) throw new Error("fieldId is required for file operations");

      if (operation === "delete") {
        return qbRequest("POST", "/files", headers, {
          tableId,
          recordId,
          fieldId,
          versionNumber,
        });
      }

      if (operation === "download") {
        const binaryPropertyName = String(p.binaryPropertyName ?? "data");
        const res = await qbRequest("POST", "/files", headers, {
          tableId,
          recordId,
          fieldId,
          versionNumber,
        });
        return res;
      }

      throw new Error(`Unsupported file operation: ${operation}`);
    }

    case "record": {
      const columns = String(p.columns ?? "");
      const where = String(resolveValue(p.where ?? "", itemJson));
      const returnAll = p.returnAll === true || p.returnAll === "true";
      const limit = p.limit ? Number(p.limit) : 50;
      const updateKey = String(p.updateKey ?? "");
      const mergeFieldId = p.mergeFieldId !== undefined && p.mergeFieldId !== "" ? p.mergeFieldId : undefined;
      const simple = p.simple !== false && p.simple !== "false";

      switch (operation) {
        case "create": {
          if (!tableId) throw new Error("tableId is required for record create");
          const fields = columnsToFields(columns, itemJson);
          const body: Record<string, unknown> = { to: tableId, data: [fields] };
          const res = await qbRequest("POST", "/records", headers, body);
          const records = (res.data as Record<string, unknown>[]) ?? [];
          if (simple && records.length > 0) {
            return simplifyRecord(records[0]);
          }
          return records.length > 0 ? records[0] : {};
        }

        case "delete": {
          if (!tableId) throw new Error("tableId is required for record delete");
          if (!where) throw new Error("where filter is required for record delete");
          return qbRequest("DELETE", "/records", headers, { from: tableId, where });
        }

        case "getAll": {
          if (!tableId) throw new Error("tableId is required for record getAll");
          let options: Record<string, unknown> = {};
          const skip = 0;
          const top = returnAll ? 10000 : limit;

          if (where) options.where = where;
          const body: Record<string, unknown> = {
            from: tableId,
            where: where || undefined,
            options: { skip, top },
          };
          const res = await qbRequest("POST", "/records/query", headers, body);
          return (res.data as Record<string, unknown>[]) ?? [];
        }

        case "update": {
          if (!tableId) throw new Error("tableId is required for record update");
          const updateFields = columnsToFields(columns, itemJson);
          if (updateKey) updateFields["updateKey"] = updateKey;
          const body: Record<string, unknown> = { to: tableId, data: [updateFields] };
          if (where) body.where = where;
          const res = await qbRequest("POST", "/records", headers, body);
          const records = (res.data as Record<string, unknown>[]) ?? [];
          if (simple && records.length > 0) {
            return simplifyRecord(records[0]);
          }
          return records.length > 0 ? records[0] : {};
        }

        case "upsert": {
          if (!tableId) throw new Error("tableId is required for record upsert");
          if (!mergeFieldId) throw new Error("mergeFieldId is required for record upsert");
          const upsertFields = columnsToFields(columns, itemJson);
          const body: Record<string, unknown> = {
            to: tableId,
            data: [upsertFields],
            mergeFieldId: typeof mergeFieldId === "number" ? mergeFieldId : Number(mergeFieldId),
          };
          const res = await qbRequest("POST", "/records", headers, body);
          const records = (res.data as Record<string, unknown>[]) ?? [];
          if (simple && records.length > 0) {
            return simplifyRecord(records[0]);
          }
          return records.length > 0 ? records[0] : {};
        }

        default:
          throw new Error(`Unsupported record operation: ${operation}`);
      }
    }

    case "report": {
      const reportId = String(resolveValue(p.reportId ?? "", itemJson));
      const returnAll = p.returnAll === true || p.returnAll === "true";
      const limit = p.limit ? Number(p.limit) : 100;

      if (!reportId) throw new Error("reportId is required for report operations");

      if (operation === "get") {
        return qbRequest("GET", `/reports/${encodeURIComponent(reportId)}`, headers);
      }

      if (operation === "run") {
        if (!tableId) throw new Error("tableId is required for report run");
        const body: Record<string, unknown> = {
          tableId,
          reportId,
          ...(returnAll ? {} : { maxRecords: limit }),
        };
        return qbRequest("POST", "/reports/run", headers, body);
      }

      throw new Error(`Unsupported report operation: ${operation}`);
    }

    default:
      throw new Error(`Unsupported resource: ${resource}`);
  }
}

function simplifyRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
      out[key] = (value as Record<string, unknown>).value;
    } else {
      out[key] = value;
    }
  }
  return out;
}
