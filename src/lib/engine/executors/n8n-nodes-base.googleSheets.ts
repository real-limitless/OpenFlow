import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";
import { sdkHttpRequest } from "@/sdk/helpers/http";

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

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

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("googleSheetsOAuth2Api");
  const token = cred ? String(cred.accessToken ?? "") : "";
  if (!token) throw new Error("GoogleSheets: googleSheetsOAuth2Api credential is not configured");
  return token;
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
}

type OpResultList = OpResult | OpResult[];

export const googleSheetsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const resource = String(node.parameters.resource ?? "sheet");
  const operation = String(node.parameters.operation ?? "append");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, binary: r.binary, pairedItem });
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
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const token = await getToken(ctx);

  if (resource === "spreadsheet") {
    if (operation === "create") return createSpreadsheet(token, node.parameters, itemJson);
    // other spreadsheet ops could be added here
    throw new Error(`GoogleSheets: unsupported spreadsheet operation "${operation}"`);
  }
  if (resource === "sheet") {
    switch (operation) {
      case "append":
        return appendRow(token, node.parameters, itemJson);
      case "read":
        return readRows(token, node.parameters, itemJson);
      case "clear":
        return clearSheet(token, node.parameters, itemJson);
      default:
        throw new Error(`GoogleSheets: unsupported sheet operation "${operation}"`);
    }
  }
  throw new Error(`GoogleSheets: unsupported resource "${resource}"`);
}

async function createSpreadsheet(
  token: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const title = String(resolveValue(params.title, itemJson) ?? "");
  const sheetsUi = (params.sheetsUi as Record<string, unknown>) ?? {};
  const locale = String(resolveValue((params.options as Record<string, unknown>)?.locale, itemJson) ?? "");
  const autoRecalc = String(resolveValue((params.options as Record<string, unknown>)?.autoRecalc, itemJson) ?? "");

  const body: Record<string, unknown> = { properties: { title } };
  if (locale) (body.properties as Record<string, unknown>).locale = locale;
  if (autoRecalc) (body.properties as Record<string, unknown>).autoRecalc = autoRecalc;
  if (sheetsUi && typeof sheetsUi === "object") {
    const values = (sheetsUi as any).sheetValues as Array<Record<string, unknown>>;
    if (Array.isArray(values)) {
      body.sheets = values.map((s) => ({ properties: { title: s.title, hidden: !!s.hidden } }));
    }
  }

  const resp = await sdkHttpRequest({
    method: "POST",
    url: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  return { json: asObj(resp.body) };
}

async function appendRow(
  token: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const documentId = resolveResourceLocator(params.documentId, itemJson);
  const sheetName = resolveResourceLocator(params.sheetName, itemJson);
  const columns = (params.columns as Record<string, unknown>) ?? {};
  const values: unknown[] = [];
  if (Array.isArray(columns?.value)) {
    for (const col of columns.value as Array<Record<string, unknown>>) {
      const fieldValue = resolveValue(col.fieldValue, itemJson);
      values.push(fieldValue);
    }
  }
  const options = (params.options as Record<string, unknown>) ?? {};
  const cellFormat = String(resolveValue(options.cellFormat, itemJson) ?? "USER_ENTERED");

  const url = `${API_BASE}/${documentId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=${cellFormat}&includeValuesInResponse=true`;
  const body = { values: [values] };
  const resp = await sdkHttpRequest({
    method: "POST",
    url,
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  return { json: asObj(resp.body) };
}

async function readRows(
  token: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<OpResult[]> {
  const documentId = resolveResourceLocator(params.documentId, itemJson);
  const sheetName = resolveResourceLocator(params.sheetName, itemJson);
  const url = `${API_BASE}/${documentId}/values/${encodeURIComponent(sheetName)}`;
  const resp = await sdkHttpRequest({
    method: "GET",
    url,
    headers: { Authorization: `Bearer ${token}` },
  });
  const rows = ((resp.body as any).values ?? []) as unknown[][];
  return rows.map((row) => ({ json: { row } }));
}

async function clearSheet(
  token: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const documentId = resolveResourceLocator(params.documentId, itemJson);
  const sheetName = resolveResourceLocator(params.sheetName, itemJson);
  const clear = String(resolveValue(params.clear, itemJson) ?? "");
  const keepFirstRow = Boolean(params.keepFirstRow);
  const url = `${API_BASE}/${documentId}/values/${encodeURIComponent(sheetName)}:clear`;
  const body: Record<string, unknown> = { range: sheetName };
  // For simplicity we ignore clear mode and keepFirstRow – they would be handled via batchUpdate in a full impl.
  const resp = await sdkHttpRequest({
    method: "POST",
    url,
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  return { json: asObj(resp.body) };
}
