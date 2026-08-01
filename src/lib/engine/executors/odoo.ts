import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { withPairedItem } from "@/sdk";

const RESOURCE_MODEL_MAP: Record<string, string> = {
  contact: "res.partner",
  note: "note.note",
  opportunity: "crm.lead",
};

interface OdooCredential {
  siteUrl: string;
  database: string;
  username: string;
  password: string;
  apiKey?: string;
}

interface JsonRpcResult {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

async function jsonRpcCall(
  url: string,
  service: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: { service, method, args },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await res.json()) as JsonRpcResult;
  if (result.error) {
    throw new Error(`Odoo RPC error: ${result.error.message} (code ${result.error.code})`);
  }
  return result.result;
}

async function authenticate(
  odooUrl: string,
  db: string,
  username: string,
  password: string,
): Promise<number> {
  const rpcUrl = `${odooUrl.replace(/\/+$/, "")}/jsonrpc`;
  const uid = await jsonRpcCall(rpcUrl, "common", "authenticate", [db, username, password]);
  if (typeof uid !== "number" || uid === 0 || uid === false) {
    throw new Error("Odoo authentication failed");
  }
  return uid;
}

async function executeKw(
  odooUrl: string,
  db: string,
  uid: number,
  password: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  const rpcUrl = `${odooUrl.replace(/\/+$/, "")}/jsonrpc`;
  return jsonRpcCall(rpcUrl, "object", "execute_kw", [db, uid, password, model, method, args, kwargs]);
}

function resolveExpression(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const expr = raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1");
      const fn = new Function("$json", `return ${expr}`);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function resolveFields(
  fields: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    resolved[key] = resolveExpression(value, itemJson);
  }
  return resolved;
}

function getModel(resource: string, customResourceModel: string): string {
  if (resource === "customResource") {
    return customResourceModel || "res.partner";
  }
  return RESOURCE_MODEL_MAP[resource] || "res.partner";
}

export const odooExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "contact");
  const operation = ctx.getParam<string>("operation", "create");
  const customResourceModel = ctx.getParam<string>("customResourceModel", "");
  const fields = ctx.getParam<Record<string, unknown>>("fields", {});
  const returnAll = ctx.getParam<boolean>("returnAll", false);
  const limit = ctx.getParam<number>("limit", 50);
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("odooApi");
  if (!cred) {
    throw new Error("Odoo: credential is not configured");
  }
  const odooCred = cred as unknown as OdooCredential;
  const odooUrl = odooCred.siteUrl || "";
  const db = odooCred.database || "";
  const username = odooCred.username || "";
  const password = odooCred.apiKey || odooCred.password || "";
  if (!odooUrl || !db || !username || !password) {
    throw new Error("Odoo: credential is missing required fields (siteUrl, database, username, password/apiKey)");
  }

  const model = getModel(resource, customResourceModel);

  if (operation === "getAll") {
    const domain: unknown[][] = [];
    const searchKwargs: Record<string, unknown> = {};
    if (!returnAll) searchKwargs.limit = limit;
    if (options.fieldsToReturn) {
      searchKwargs.fields = String(options.fieldsToReturn).split(",").map((s) => s.trim());
    }
    if (options.orderBy) searchKwargs.order = String(options.orderBy);
    if (options.filter) {
      try {
        const parsed = JSON.parse(String(options.filter));
        if (Array.isArray(parsed)) domain.push(...parsed);
      } catch {
        domain.push([String(options.filter), "=", true]);
      }
    }
    const uid = await authenticate(odooUrl, db, username, password);
    const records = (await executeKw(odooUrl, db, uid, password, model, "search_read", [domain], searchKwargs)) as Array<Record<string, unknown>>;
    const items: INodeExecutionData[] = (records || []).map((rec, idx) => ({
      json: rec,
      pairedItem: { item: idx },
    }));
    return [items.length > 0 ? items : [{ json: {} }]];
  }

  const recordIdParam = ctx.getParam<string>("recordId", "");

  const items: INodeExecutionData[] = [];
  const itemsToProcess = inputItems.length > 0 ? inputItems : [{ json: {} }];

  for (let idx = 0; idx < itemsToProcess.length; idx++) {
    const item = itemsToProcess[idx];
    const itemJson = item.json || {};
    try {
      const uid = await authenticate(odooUrl, db, username, password);

      if (operation === "create") {
        const resolvedFields = resolveFields(fields, itemJson);
        if (Object.keys(resolvedFields).length === 0) {
          throw new Error("Odoo: at least one field is required for create");
        }
        const newId = (await executeKw(odooUrl, db, uid, password, model, "create", [resolvedFields])) as number;
        const record = (await executeKw(odooUrl, db, uid, password, model, "read", [newId])) as Array<Record<string, unknown>>;
        const result = record && record.length > 0 ? record[0] : { id: newId };
        items.push(withPairedItem({ json: result }, idx));
      } else if (operation === "get") {
        const recordId = Number(resolveExpression(recordIdParam, itemJson));
        if (!recordId) throw new Error("Odoo: recordId is required for get");
        const record = (await executeKw(odooUrl, db, uid, password, model, "read", [recordId])) as Array<Record<string, unknown>>;
        if (!record || record.length === 0) throw new Error(`Odoo: record ${recordId} not found`);
        items.push(withPairedItem({ json: record[0] }, idx));
      } else if (operation === "update") {
        const recordId = Number(resolveExpression(recordIdParam, itemJson));
        if (!recordId) throw new Error("Odoo: recordId is required for update");
        const resolvedFields = resolveFields(fields, itemJson);
        await executeKw(odooUrl, db, uid, password, model, "write", [[recordId], resolvedFields]);
        const record = (await executeKw(odooUrl, db, uid, password, model, "read", [recordId])) as Array<Record<string, unknown>>;
        const result = record && record.length > 0 ? record[0] : { id: recordId };
        items.push(withPairedItem({ json: result }, idx));
      } else if (operation === "delete") {
        const recordId = Number(resolveExpression(recordIdParam, itemJson));
        if (!recordId) throw new Error("Odoo: recordId is required for delete");
        await executeKw(odooUrl, db, uid, password, model, "unlink", [[recordId]]);
        items.push(withPairedItem({ json: { id: recordId, success: true } }, idx));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (continueOnFail) {
        items.push(withPairedItem({ json: { error: { message, code: 500 } } }, idx));
      } else {
        throw err;
      }
    }
  }

  return [items];
};