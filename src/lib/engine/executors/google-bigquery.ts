import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const BQ_API = "https://bigquery.googleapis.com/bigquery/v2";

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

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2");
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleBigQueryOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleBigQuery: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleBigQuery: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
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
    throw new Error(`GoogleBigQuery: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

async function executeQueryOp(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData[]> {
  const projectId = resolveLocator(node.parameters.projectId, itemJson);
  const datasetId = resolveLocator(node.parameters.datasetId, itemJson);
  const sqlQuery = String(resolveValue(node.parameters.sqlQuery ?? "", itemJson) ?? "");
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const dryRun = options.dryRun === true;
  const includeSchema = options.includeSchema === true;
  const maxResults = Number(options.maxResults ?? 1000);
  const timeoutMs = Number(options.timeoutMs ?? 10000);
  const rawOutput = options.rawOutput === true;
  const useLegacySql = options.useLegacySql === true;
  const returnAsNumbers = options.returnAsNumbers === true;
  const location = String(options.location ?? "");
  const maximumBytesBilled = String(options.maximumBytesBilled ?? "");
  const defaultDataset = String(options.defaultDataset ?? "");

  const requestBody: Record<string, unknown> = {
    query: sqlQuery,
    useLegacySql,
    maxResults,
    timeoutMs,
  };

  if (dryRun) {
    requestBody.dryRun = true;
  }
  if (location) {
    requestBody.location = location;
  }
  if (maximumBytesBilled) {
    requestBody.maximumBytesBilled = maximumBytesBilled;
  }
  if (defaultDataset) {
    requestBody.defaultDataset = { datasetId: defaultDataset };
  } else if (datasetId) {
    requestBody.defaultDataset = { datasetId };
  }
  if (returnAsNumbers) {
    requestBody.formatOptions = { useInt64AsNumber: true };
  }

  const queryParams = options.queryParameters as { namedParameters?: Array<{ name: string; value: string }> } | undefined;
  if (queryParams?.namedParameters?.length) {
    requestBody.queryParameters = queryParams.namedParameters.map((p) => ({
      name: p.name,
      parameterType: { type: "STRING" },
      parameterValue: { value: p.value },
    }));
  }

  const url = `${BQ_API}/projects/${encodeURIComponent(projectId)}/queries`;
  const { body } = await apiRequest("POST", url, token, requestBody);
  const resp = asObj(body);

  if (dryRun || rawOutput) {
    return [{ json: resp }];
  }

  const schema = resp.schema as { fields?: Array<{ name: string; type: string }> } | undefined;
  const rows = resp.rows as Array<{ f: Array<{ v: unknown }> }> | undefined;

  if (!rows || !schema?.fields) {
    return [];
  }

  const fields = schema.fields;
  const result: INodeExecutionData[] = [];

  for (const row of rows) {
    const json: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      let val = row.f[i]?.v;
      if (typeof val === "string" && field.type === "INTEGER" && returnAsNumbers) {
        val = parseInt(val, 10);
      }
      if (typeof val === "string" && field.type === "FLOAT" && returnAsNumbers) {
        val = parseFloat(val);
      }
      json[field.name] = val;
    }
    if (includeSchema) {
      json._schema = schema;
    }
    result.push({ json });
  }

  return result;
}

async function insertOp(
  ctx: ExecutionContext,
  node: INode,
  inputItems: INodeExecutionData[],
  token: string,
): Promise<INodeExecutionData[]> {
  const itemJson = inputItems[0]?.json ?? {};
  const projectId = resolveLocator(node.parameters.projectId, itemJson);
  const datasetId = resolveLocator(node.parameters.datasetId, itemJson);
  const tableId = resolveLocator(node.parameters.tableId, itemJson);
  const dataMode = String(node.parameters.dataMode ?? ctx.getParam("dataMode", "autoMap") ?? "autoMap");
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const batchSize = Number(options.batchSize ?? 100);
  const ignoreUnknownValues = options.ignoreUnknownValues === true;
  const skipInvalidRows = options.skipInvalidRows === true;
  const templateSuffix = String(options.templateSuffix ?? "");
  const traceId = String(options.traceId ?? "");

  const url = `${BQ_API}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables/${encodeURIComponent(tableId)}/insertAll`;

  const out: INodeExecutionData[] = [];
  for (let start = 0; start < inputItems.length; start += batchSize) {
    const batch = inputItems.slice(start, start + batchSize);
    const rows: Array<{ json: Record<string, unknown>; insertId?: string }> = [];

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const rowJson = item.json ?? {};
      let row: Record<string, unknown>;

      if (dataMode === "define") {
        row = {};
        const fieldsUi = (node.parameters.fieldsUi ?? {}) as { values?: Array<{ fieldId: string; fieldValue: string }> };
        const values = fieldsUi.values ?? [];
        for (const f of values) {
          if (f.fieldId) {
            row[f.fieldId] = resolveValue(f.fieldValue, rowJson);
          }
        }
      } else {
        row = { ...rowJson };
      }

      const entry: { json: Record<string, unknown>; insertId?: string } = { json: row };
      out.push({ json: row, pairedItem: { item: start + i, input: 0 } });
      rows.push(entry);
    }

    const requestBody: Record<string, unknown> = {
      rows,
      ignoreUnknownValues,
      skipInvalidRows,
    };
    if (templateSuffix) {
      requestBody.templateSuffix = templateSuffix;
    }
    if (traceId) {
      requestBody.traceId = traceId;
    }

    const { body } = await apiRequest("POST", url, token, requestBody);
    const resp = asObj(body);
    const insertErrors = resp.insertErrors as Array<{ errors: Array<{ message: string }> }> | undefined;
    if (insertErrors?.length) {
      const firstErr = insertErrors[0]?.errors?.[0]?.message;
      if (firstErr) {
        throw new Error(`GoogleBigQuery: ${firstErr}`);
      }
    }
  }

  return out;
}

export const googleBigQueryExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "executeQuery") ?? "executeQuery");
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  if (operation === "executeQuery") {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemJson = item.json ?? {};
      try {
        const token = await getAccessToken(ctx, node);
        const results = await executeQueryOp(node, itemJson, token);
        for (const r of results) {
          out.push({ json: r.json, pairedItem: { item: idx, input: 0 } });
        }
      } catch (err) {
        if (!continueOnFail) throw err;
        const message = err instanceof Error ? err.message : String(err);
        out.push({ json: { error: message }, pairedItem: { item: idx, input: 0 } });
      }
    }
  } else {
    try {
      const token = await getAccessToken(ctx, node);
      const results = await insertOp(ctx, node, items, token);
      out.push(...results);
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem: { item: 0, input: 0 } });
    }
  }

  return [out];
};