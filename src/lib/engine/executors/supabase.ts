import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

interface SupabaseCredential {
  host: string;
  secretKey: string;
}

interface FilterCondition {
  keyName: string;
  condition: string;
  keyValue: string;
}

interface FieldValue {
  fieldId: string;
  fieldValue: string;
}

async function getCredential(ctx: ExecutionContext): Promise<SupabaseCredential> {
  const cred = await ctx.getCredential("supabaseApi");
  if (!cred) throw new Error("Supabase: No valid credential found. Configure supabaseApi.");
  const data = cred as Record<string, unknown>;
  const host = String(data.host ?? "");
  const secretKey = String(data.secretKey ?? "");
  if (!host || !secretKey) throw new Error("Supabase: Credential missing host or secretKey.");
  return { host, secretKey };
}

function buildFilters(conditions: FilterCondition[], matchType: string): string[][] {
  const params: string[][] = [];
  if (matchType === "anyFilter" && conditions.length > 1) {
    const orParts = conditions.map((c) => {
      const val = escapeFilterValue(c.keyValue, c.condition);
      return `${c.keyName}.${c.condition}.${val}`;
    });
    params.push(["or", `(${orParts.join(",")})`]);
    return params;
  }
  for (const c of conditions) {
    const val = escapeFilterValue(c.keyValue, c.condition);
    params.push([`${c.keyName}`, `${c.condition}.${val}`]);
  }
  return params;
}

function escapeFilterValue(value: string, condition: string): string {
  if (condition === "like" || condition === "ilike") {
    return value.replace(/\*/g, "%");
  }
  return value;
}

function buildFilterString(raw: string): string {
  return raw;
}

function buildBody(
  itemJson: Record<string, unknown>,
  dataToSend: string,
  inputsToIgnore: string,
  fieldsUi: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (dataToSend === "autoMapInputData") {
    const ignoreSet = new Set(inputsToIgnore.split(",").map((s) => s.trim()).filter(Boolean));
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(itemJson)) {
      if (!ignoreSet.has(k)) {
        body[k] = v;
      }
    }
    return body;
  }
  const body: Record<string, unknown> = {};
  if (fieldsUi?.fieldValues && Array.isArray(fieldsUi.fieldValues)) {
    for (const fv of fieldsUi.fieldValues as FieldValue[]) {
      body[fv.fieldId] = fv.fieldValue;
    }
  }
  return body;
}

async function supabaseApi(
  method: string,
  tableId: string,
  credential: SupabaseCredential,
  queryParams: string[][],
  body: Record<string, unknown> | undefined,
  schema: string | undefined,
): Promise<unknown> {
  const base = `https://${credential.host}/rest/v1`;
  let url = `${base}/${encodeURIComponent(tableId)}`;
  const qs = new URLSearchParams();
  for (const [k, v] of queryParams) qs.append(k, v);
  const qStr = qs.toString();
  if (qStr) url += `?${qStr}`;

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "apiKey": credential.secretKey,
    "Authorization": `Bearer ${credential.secretKey}`,
  };

  if (schema) {
    headers["Accept-Profile"] = schema;
  }

  if (method === "POST" || method === "PATCH") {
    headers["Prefer"] = "return=representation";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      throw Object.assign(new Error(`Supabase API error ${res.status}: ${text}`), { status: res.status });
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export const supabaseExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = ctx.getParams();
  const continueOnFail = ctx.continueOnFail();

  const resource = String(params.resource ?? "row");
  const operation = String(params.operation ?? "create");
  const tableId = String(params.tableId ?? "");
  const useCustomSchema = Boolean(params.useCustomSchema);
  const schema = useCustomSchema ? String(params.schema ?? "public") : undefined;

  if (resource !== "row") {
    throw new Error(`Supabase: unsupported resource "${resource}"`);
  }
  if (!tableId) {
    throw new Error("Supabase: tableId is required");
  }

  const credential = await getCredential(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = (item.json ?? {}) as Record<string, unknown>;
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      let result: unknown;

      switch (operation) {
        case "create": {
          const dataToSend = String(params.dataToSend ?? "defineBelow");
          const inputsToIgnore = String(params.inputsToIgnore ?? "");
          const fieldsUi = params.fieldsUi as Record<string, unknown> | undefined;
          const body = buildBody(itemJson, dataToSend, inputsToIgnore, fieldsUi);
          result = await supabaseApi("POST", tableId, credential, [["select", "*"]], body, schema);
          break;
        }

        case "get": {
          const filtersParam = params.filters as Record<string, unknown> | undefined;
          const conditions: FilterCondition[] = [];
          if (filtersParam?.conditions && Array.isArray(filtersParam.conditions)) {
            for (const c of filtersParam.conditions as FilterCondition[]) {
              conditions.push(c);
            }
          }
          const qParams = buildFilters(conditions, "allFilters");
          qParams.push(["select", "*"]);
          result = await supabaseApi("GET", tableId, credential, qParams, undefined, schema);
          break;
        }

        case "getAll": {
          const returnAll = Boolean(params.returnAll);
          const limit = Number(params.limit ?? 50);
          const filterType = String(params.filterType ?? "none");
          const qParams: string[][] = [["select", "*"]];

          if (!returnAll && limit > 0) {
            qParams.push(["limit", String(limit)]);
          }

          if (filterType === "manual") {
            const matchType = String(params.matchType ?? "anyFilter");
            const filtersParam = params.filters as Record<string, unknown> | undefined;
            const conditions: FilterCondition[] = [];
            if (filtersParam?.conditions && Array.isArray(filtersParam.conditions)) {
              for (const c of filtersParam.conditions as FilterCondition[]) {
                conditions.push(c);
              }
            }
            const filterParams = buildFilters(conditions, matchType);
            qParams.push(...filterParams);
          } else if (filterType === "string") {
            const filterString = String(params.filterString ?? "");
            if (filterString) {
              const parts = filterString.split("&");
              for (const part of parts) {
                const eqIdx = part.indexOf("=");
                if (eqIdx > 0) {
                  qParams.push([part.slice(0, eqIdx), part.slice(eqIdx + 1)]);
                } else {
                  qParams.push(["", part]);
                }
              }
            }
          }

          result = await supabaseApi("GET", tableId, credential, qParams, undefined, schema);
          break;
        }

        case "update": {
          const dataToSend = String(params.dataToSend ?? "defineBelow");
          const inputsToIgnore = String(params.inputsToIgnore ?? "");
          const fieldsUi = params.fieldsUi as Record<string, unknown> | undefined;
          const body = buildBody(itemJson, dataToSend, inputsToIgnore, fieldsUi);
          const filterType = String(params.filterType ?? "manual");
          const qParams: string[][] = [];

          if (filterType === "manual") {
            const matchType = String(params.matchType ?? "anyFilter");
            const filtersParam = params.filters as Record<string, unknown> | undefined;
            const conditions: FilterCondition[] = [];
            if (filtersParam?.conditions && Array.isArray(filtersParam.conditions)) {
              for (const c of filtersParam.conditions as FilterCondition[]) {
                conditions.push(c);
              }
            }
            const filterParams = buildFilters(conditions, matchType);
            qParams.push(...filterParams);
          } else if (filterType === "string") {
            const filterString = String(params.filterString ?? "");
            if (filterString) {
              const parts = filterString.split("&");
              for (const part of parts) {
                const eqIdx = part.indexOf("=");
                if (eqIdx > 0) {
                  qParams.push([part.slice(0, eqIdx), part.slice(eqIdx + 1)]);
                } else {
                  qParams.push(["", part]);
                }
              }
            }
          } else {
            throw new Error("Supabase update: filterType must be 'manual' or 'string'");
          }

          result = await supabaseApi("PATCH", tableId, credential, qParams, body, schema);
          break;
        }

        case "delete": {
          const filterType = String(params.filterType ?? "manual");
          const qParams: string[][] = [];

          if (filterType === "manual") {
            const matchType = String(params.matchType ?? "anyFilter");
            const filtersParam = params.filters as Record<string, unknown> | undefined;
            const conditions: FilterCondition[] = [];
            if (filtersParam?.conditions && Array.isArray(filtersParam.conditions)) {
              for (const c of filtersParam.conditions as FilterCondition[]) {
                conditions.push(c);
              }
            }
            const filterParams = buildFilters(conditions, matchType);
            qParams.push(...filterParams);
          } else if (filterType === "string") {
            const filterString = String(params.filterString ?? "");
            if (filterString) {
              const parts = filterString.split("&");
              for (const part of parts) {
                const eqIdx = part.indexOf("=");
                if (eqIdx > 0) {
                  qParams.push([part.slice(0, eqIdx), part.slice(eqIdx + 1)]);
                } else {
                  qParams.push(["", part]);
                }
              }
            }
          } else {
            throw new Error("Supabase delete: filterType must be 'manual' or 'string'");
          }

          await supabaseApi("DELETE", tableId, credential, qParams, undefined, schema);
          result = { success: true };
          break;
        }

        default:
          throw new Error(`Supabase: unsupported operation "${operation}"`);
      }

      const resultArray = (() => {
        if (operation === "getAll") {
          if (Array.isArray(result)) return result as Record<string, unknown>[];
          return [];
        }
        if (operation === "delete") {
          return [result as Record<string, unknown>];
        }
        if (Array.isArray(result) && result.length > 0) {
          return [result[0] as Record<string, unknown>];
        }
        if (operation === "get") {
          return [{}];
        }
        return [{}];
      })();

      for (const r of resultArray) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};