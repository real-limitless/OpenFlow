import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

async function qbRequest(
  ctx: ExecutionContext,
  path: string,
  method: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const cred = await ctx.getCredential("quickbaseApi");
  if (!cred) throw new Error("Quick Base API credentials are required");

  const credData = cred as Record<string, unknown>;
  const hostname = String(credData.hostname ?? "");
  const userToken = String(credData.userToken ?? "");

  const url = `https://${hostname}.quickbase.com/db${path}`;

  const headers: Record<string, string> = {
    "QB-Realm-Hostname": `${hostname}.quickbase.com`,
    "Authorization": `QB-USER-TOKEN ${userToken}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let errMsg = `Quick Base API error: ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody && typeof errBody === "object") {
        errMsg = String((errBody as Record<string, unknown>).message ?? errMsg);
      }
    } catch {}
    throw new Error(errMsg);
  }

  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

export const quickBaseExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "record");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOp(ctx, resource, operation, node, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};

async function runOp(
  ctx: ExecutionContext,
  resource: string,
  operation: string,
  node: { parameters: Record<string, unknown> },
  item: INodeExecutionData,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const p = node.parameters;
  const tableId = String(p.tableId ?? "");

  switch (resource) {
    case "field": {
      if (operation === "getAll") {
        const body: Record<string, unknown> = {};
        if (tableId) body.tableId = tableId;
        return qbRequest(ctx, "/fields", "GET", body);
      }
      throw new Error(`Unsupported field operation: ${operation}`);
    }

    case "file": {
      const recordId = String(p.recordId ?? "");
      const fieldId = String(p.fieldId ?? "");
      const fileId = String(p.fileId ?? "");
      const versionNumber = Number(p.versionNumber ?? 1);

      if (!tableId) throw new Error("tableId is required for file operations");
      if (!recordId) throw new Error("recordId is required for file operations");
      if (!fieldId) throw new Error("fieldId is required for file operations");

      if (operation === "delete") {
        if (!fileId) throw new Error("fileId is required for file delete");
        return qbRequest(ctx, "/file/delete", "POST", {
          tableId,
          recordId,
          fieldId,
          fileId,
          versionNumber,
        });
      }
      if (operation === "download") {
        if (!fileId) throw new Error("fileId is required for file download");
        const result = await qbRequest(ctx, "/file/download", "POST", {
          tableId,
          recordId,
          fieldId,
          fileId,
          versionNumber,
        });
        return { json: result as unknown as Record<string, unknown> };
      }
      throw new Error(`Unsupported file operation: ${operation}`);
    }

    case "record": {
      const recordId = String(p.recordId ?? "");
      const fields = parseJson(p.fields);
      const filter = String(p.filter ?? "");
      const limit = p.limit ? Number(p.limit) : 0;
      const sortBy = String(p.sortBy ?? "");
      const sortDirection = String(p.sortDirection ?? "ASC");
      const upsertKey = String(p.upsertKey ?? "");

      switch (operation) {
        case "create": {
          if (!tableId) throw new Error("tableId is required for record create");
          const body: Record<string, unknown> = {
            to: tableId,
            data: [{ ...fields }],
          };
          const res = await qbRequest(ctx, "/", "POST", body);
          const records = (res.data as Record<string, unknown>[]) ?? [];
          return records.length > 0 ? records[0] : {};
        }

        case "delete": {
          if (!tableId) throw new Error("tableId is required for record delete");
          if (!recordId) throw new Error("recordId is required for record delete");
          return qbRequest(ctx, "/", "DELETE", {
            from: tableId,
            where: `{3.EX.${recordId}}`,
          });
        }

        case "getAll": {
          if (!tableId) throw new Error("tableId is required for record getAll");
          const body: Record<string, unknown> = {
            from: tableId,
          };
          if (filter) body["where"] = filter;
          if (limit > 0) body["options"] = { limit };
          if (sortBy) body["sortBy"] = [{ fieldId: Number(sortBy), order: sortDirection === "DESC" ? "DESC" : "ASC" }];
          const res = await qbRequest(ctx, "/", "POST", body);
          return (res.data as Record<string, unknown>[]) ?? [];
        }

        case "update": {
          if (!tableId) throw new Error("tableId is required for record update");
          if (!recordId) throw new Error("recordId is required for record update");
          const body: Record<string, unknown> = {
            to: tableId,
            where: `{3.EX.${recordId}}`,
            data: [{ ...fields }],
          };
          const res = await qbRequest(ctx, "/", "POST", body);
          const records = (res.data as Record<string, unknown>[]) ?? [];
          return records.length > 0 ? records[0] : {};
        }

        case "upsert": {
          if (!tableId) throw new Error("tableId is required for record upsert");
          if (!upsertKey) throw new Error("upsertKey is required for record upsert");
          const body: Record<string, unknown> = {
            to: tableId,
            data: [{ ...fields }],
            mergeFieldId: upsertKey,
          };
          const res = await qbRequest(ctx, "/", "POST", body);
          const records = (res.data as Record<string, unknown>[]) ?? [];
          return records.length > 0 ? records[0] : {};
        }

        default:
          throw new Error(`Unsupported record operation: ${operation}`);
      }
    }

    case "report": {
      const reportId = String(p.reportId ?? "");
      if (!reportId) throw new Error("reportId is required for report operations");

      if (operation === "get") {
        return qbRequest(ctx, `/report/${reportId}`, "GET");
      }

      if (operation === "run") {
        const body: Record<string, unknown> = {};
        if (tableId) body.tableId = tableId;
        body.reportId = reportId;
        return qbRequest(ctx, "/reports", "POST", body);
      }

      throw new Error(`Unsupported report operation: ${operation}`);
    }

    default:
      throw new Error(`Unsupported resource: ${resource}`);
  }
}
