import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

interface BambooHrCredential {
  subdomain?: string;
  apiKey?: string;
}

interface ApiResult {
  status: number;
  body: unknown;
  text: string;
  headers: Headers;
}

function buildBaseUrl(creds: BambooHrCredential): string {
  const subdomain = (creds.subdomain ?? "").replace(/\.bamboohr\.com$/, "");
  return `https://${subdomain}.bamboohr.com`;
}

function authHeaders(creds: BambooHrCredential): Record<string, string> {
  if (!creds.apiKey) return {};
  return { Authorization: `Basic ${Buffer.from(`${creds.apiKey}:`).toString("base64")}` };
}

async function apiRequest(
  creds: BambooHrCredential,
  method: string,
  path: string,
  body?: unknown,
  formatHint?: string,
): Promise<ApiResult> {
  const baseUrl = buildBaseUrl(creds);
  const headers: Record<string, string> = {
    Accept: formatHint === "JSON" || !formatHint ? "application/json" : "*/*",
    ...authHeaders(creds),
  };
  if (body !== undefined && typeof body !== "string" && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = body instanceof FormData || typeof body === "string" ? body : JSON.stringify(body);
  }
  const resp = await fetch(`${baseUrl}/v1${path}`, init);
  const text = await resp.text();
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = text; }
  if (!resp.ok) {
    const msg = typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).error ?? (parsed as Record<string, unknown>).message ?? resp.statusText
      : resp.statusText;
    throw Object.assign(new Error(`BambooHR API error: ${msg}`), { status: resp.status, body: parsed });
  }
  return { status: resp.status, body: parsed, text, headers: resp.headers };
}

function mimeFromFormat(format: string): string {
  switch (format.toUpperCase()) {
    case "CSV": return "text/csv";
    case "PDF": return "application/pdf";
    case "XLSX": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "XML": return "application/xml";
    default: return "application/octet-stream";
  }
}

export const bambooHrExecutor: NodeExecutor = async (
  ctx: ExecutionContext,
  _node: { parameters: Record<string, unknown> },
): Promise<INodeExecutionData[][]> => {
  const items = ensureItems(ctx.getInputItems(0));
  const credentials = (await ctx.getCredential("bambooHrApi")) as BambooHrCredential | null;
  if (!credentials?.subdomain || !credentials?.apiKey) {
    throw new Error("BambooHR credential with subdomain and API key is required");
  }

  const resource = ctx.getParam<string>("resource", "");
  const operation = ctx.getParam<string>("operation", "");
  const continueOnFail = ctx.continueOnFail();

  const results: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = { item: idx, input: 0 };
    try {
      let result: Record<string, unknown> = {};
      let binaryAttachment: { name: string; data: string; mimeType: string } | null = null;

      if (resource === "companyReport" && operation === "get") {
        const reportId = ctx.getParam<string>("reportId", "");
        const format = ctx.getParam<string>("format", "JSON");
        const output = ctx.getParam<string>("output", "");
        const filters = ctx.getParam<Record<string, unknown>>("options", {}).filters;

        let qs = "";
        if (filters && typeof filters === "object") {
          const f = filters as Record<string, unknown>;
          const params: string[] = [];
          if (f.dateStart) params.push(`dateStart=${encodeURIComponent(String(f.dateStart))}`);
          if (f.dateEnd) params.push(`dateEnd=${encodeURIComponent(String(f.dateEnd))}`);
          if (f.employeeStatus) params.push(`employeeStatus=${encodeURIComponent(String(f.employeeStatus))}`);
          if (f.includeTerminated !== undefined) params.push(`includeTerminated=${f.includeTerminated}`);
          if (params.length) qs = "?" + params.join("&");
        }
        const formatLower = format.toLowerCase();
        const isJson = format === "JSON";

        if (output === "URL" && !isJson) {
          const queryStr = qs ? qs.replace("?", "&") : "";
          const { body } = await apiRequest(credentials, "GET", `/company/reports/${reportId}?format=${formatLower}${queryStr}`);
          const b = body as Record<string, unknown> | undefined;
          result = { url: b?.url ?? `https://${credentials.subdomain}.bamboohr.com/company/reports/${reportId}?format=${formatLower}${queryStr}`, reportId, format };
        } else if (output === "Id" && !isJson) {
          result = { fileId: reportId, format };
        } else if (output === "File" && !isJson) {
          const queryStr = qs ? qs.replace("?", "&") : "";
          const baseUrl = buildBaseUrl(credentials);
          const resp = await fetch(`${baseUrl}/v1/company/reports/${reportId}?format=${formatLower}${queryStr}`, {
            headers: authHeaders(credentials),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            throw Object.assign(new Error(`BambooHR API error: ${resp.statusText}`), { status: resp.status, body: errText });
          }
          const arrayBuf = await resp.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          binaryAttachment = {
            name: `report-${reportId}.${formatLower}`,
            data: buf.toString("base64"),
            mimeType: mimeFromFormat(format),
          };
          result = { reportId, format, fileSize: buf.length };
        } else {
          const { body } = await apiRequest(credentials, "GET", `/company/reports/${reportId}${qs}`);
          result = { data: body, format, reportId };
        }
      } else if (resource === "employee" && operation === "create") {
        const payload: Record<string, unknown> = {
          firstName: ctx.getParam<string>("firstName", ""),
          lastName: ctx.getParam<string>("lastName", ""),
        };
        const synced = ctx.getParam<boolean>("synced", false);
        if (synced) payload.synced = true;
        const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});
        for (const [k, v] of Object.entries(additionalFields)) {
          if (v !== undefined && v !== null && v !== "") payload[k] = v;
        }
        const { body } = await apiRequest(credentials, "POST", "/employees", payload);
        result = (body as Record<string, unknown>) ?? { id: "created" };
      } else if (resource === "employee" && operation === "get") {
        const employeeId = ctx.getParam<string>("employeeId", "");
        const optionsFields = ctx.getParam<Record<string, unknown>>("options", {});
        let path = `/employees/${employeeId}`;
        const fields = (optionsFields as Record<string, unknown>).fields;
        if (fields) {
          const fieldList = Array.isArray(fields) ? fields.join(",") : String(fields);
          path += `?fields=${encodeURIComponent(fieldList)}`;
        }
        const { body } = await apiRequest(credentials, "GET", path);
        result = (body as Record<string, unknown>) ?? {};
      } else if (resource === "employee" && operation === "getAll") {
        const returnAll = ctx.getParam<boolean>("returnAll", false);
        const limit = ctx.getParam<number>("limit", 50);
        let path = "/employees/directory";
        if (!returnAll) {
          path += `?limit=${limit}`;
        }
        const { body } = await apiRequest(credentials, "GET", path);
        const b = body as Record<string, unknown> | undefined;
        const employees = (b?.employees as unknown[]) ?? (b?.results as unknown[]) ?? [];
        const sliced = returnAll ? employees : employees.slice(0, limit);
        result = { employees: sliced, count: sliced.length };
      } else if (resource === "employee" && operation === "update") {
        const employeeId = ctx.getParam<string>("employeeId", "");
        const synced = ctx.getParam<boolean>("synced", false);
        const updateFields = ctx.getParam<Record<string, unknown>>("updateFields", {});
        const payload: Record<string, unknown> = {};
        if (synced) payload.synced = true;
        for (const [k, v] of Object.entries(updateFields)) {
          if (v !== undefined && v !== null && v !== "") payload[k] = v;
        }
        const { body } = await apiRequest(credentials, "POST", `/employees/${employeeId}`, payload);
        result = (body as Record<string, unknown>) ?? { id: employeeId, updated: true };
      } else if (resource === "employeeDocument" && operation === "delete") {
        const employeeId = ctx.getParam<string>("employeeId", "");
        const fileId = ctx.getParam<string>("fileId", "");
        await apiRequest(credentials, "DELETE", `/employees/${employeeId}/files/${fileId}`);
        result = { ...item.json, success: true };
      } else if (resource === "employeeDocument" && operation === "download") {
        const employeeId = ctx.getParam<string>("employeeId", "");
        const fileId = ctx.getParam<string>("fileId", "");
        const output = ctx.getParam<string>("output", "File");
        if (output === "File") {
          const baseUrl = buildBaseUrl(credentials);
          const resp = await fetch(`${baseUrl}/v1/employees/${employeeId}/files/${fileId}/download`, {
            headers: authHeaders(credentials),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            throw Object.assign(new Error(`BambooHR API error: ${resp.statusText}`), { status: resp.status, body: errText });
          }
          const arrayBuf = await resp.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          const ct = resp.headers.get("content-type") ?? "application/octet-stream";
          binaryAttachment = {
            name: `${fileId}`,
            data: buf.toString("base64"),
            mimeType: ct,
          };
          result = { fileId, fileSize: buf.length };
        } else if (output === "URL") {
          result = { url: `https://${credentials.subdomain}.bamboohr.com/employees/${employeeId}/files/${fileId}/download` };
        } else {
          result = { fileId };
        }
      } else if (resource === "employeeDocument" && operation === "getAll") {
        const employeeId = ctx.getParam<string>("employeeId", "");
        const returnAll = ctx.getParam<boolean>("returnAll", false);
        const limit = ctx.getParam<number>("limit", 50);
        const simplify = ctx.getParam<boolean>("simplifyOutput", false);
        const { body } = await apiRequest(credentials, "GET", `/employees/${employeeId}/files/view`);
        const b = body as Record<string, unknown> | undefined;
        const documents = (b?.documents as unknown[]) ?? (b?.files as unknown[]) ?? [];
        const sliced = returnAll ? documents : documents.slice(0, limit);
        result = simplify ? { documents: sliced } : { documents: sliced, count: sliced.length };
      } else if (resource === "employeeDocument" && operation === "update") {
        const employeeId = ctx.getParam<string>("employeeId", "");
        const fileId = ctx.getParam<string>("fileId", "");
        const updateFields = ctx.getParam<Record<string, unknown>>("updateFields", {});
        await apiRequest(credentials, "POST", `/employees/${employeeId}/files/${fileId}`, updateFields);
        result = { id: fileId, updated: true };
      } else if (resource === "employeeDocument" && operation === "upload") {
        const employeeId = ctx.getParam<string>("employeeId", "");
        const categoryId = ctx.getParam<string>("categoryId", "");
        const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "");
        const shareWithEmployee = ctx.getParam<boolean>("options", {}).shareWithEmployee ?? false;
        const binaryData = (item.binary ?? {})[binaryPropertyName];
        const formData = new FormData();
        formData.append("category", categoryId);
        if (binaryData && typeof binaryData === "object" && "data" in binaryData) {
          const bytes = Uint8Array.from(atob(binaryData.data as string), c => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: (binaryData as { mimeType?: string }).mimeType ?? "application/octet-stream" });
          formData.append("file", blob, "upload");
        }
        if (shareWithEmployee) formData.append("shareWithEmployee", "true");
        const baseUrl = buildBaseUrl(credentials);
        const resp = await fetch(`${baseUrl}/v1/employees/${employeeId}/files/${categoryId}`, {
          method: "POST",
          headers: authHeaders(credentials),
          body: formData,
        });
        const text = await resp.text();
        let respBody: unknown;
        try { respBody = text ? JSON.parse(text) : {}; } catch { respBody = text; }
        if (!resp.ok) {
          const msg = typeof respBody === "object" && respBody !== null
            ? (respBody as Record<string, unknown>).error ?? (respBody as Record<string, unknown>).message ?? resp.statusText
            : resp.statusText;
          throw Object.assign(new Error(`BambooHR API error: ${msg}`), { status: resp.status, body: respBody });
        }
        result = (respBody as Record<string, unknown>) ?? { id: "uploaded" };
      } else if (resource === "file" && operation === "delete") {
        const fileId = ctx.getParam<string>("fileId", "");
        await apiRequest(credentials, "DELETE", `/files/${fileId}`);
        result = { ...item.json, success: true };
      } else if (resource === "file" && operation === "download") {
        const fileId = ctx.getParam<string>("fileId", "");
        const output = ctx.getParam<string>("output", "File");
        if (output === "File") {
          const baseUrl = buildBaseUrl(credentials);
          const resp = await fetch(`${baseUrl}/v1/files/${fileId}/download`, {
            headers: authHeaders(credentials),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            throw Object.assign(new Error(`BambooHR API error: ${resp.statusText}`), { status: resp.status, body: errText });
          }
          const arrayBuf = await resp.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          const ct = resp.headers.get("content-type") ?? "application/octet-stream";
          binaryAttachment = {
            name: `${fileId}`,
            data: buf.toString("base64"),
            mimeType: ct,
          };
          result = { fileId, fileSize: buf.length };
        } else if (output === "URL") {
          result = { url: `https://${credentials.subdomain}.bamboohr.com/files/${fileId}/download` };
        } else {
          result = { fileId };
        }
      } else if (resource === "file" && operation === "getAll") {
        const returnAll = ctx.getParam<boolean>("returnAll", false);
        const limit = ctx.getParam<number>("limit", 50);
        const simplify = ctx.getParam<boolean>("simplifyOutput", false);
        const { body } = await apiRequest(credentials, "GET", "/files");
        const b = body as Record<string, unknown> | undefined;
        const files = (b?.files as unknown[]) ?? [];
        const sliced = returnAll ? files : files.slice(0, limit);
        result = simplify ? { files: sliced } : { files: sliced, count: sliced.length };
      } else if (resource === "file" && operation === "update") {
        const fileId = ctx.getParam<string>("fileId", "");
        const updateFields = ctx.getParam<Record<string, unknown>>("updateFields", {});
        await apiRequest(credentials, "POST", `/files/${fileId}`, updateFields);
        result = { id: fileId, updated: true };
      } else if (resource === "file" && operation === "upload") {
        const categoryId = ctx.getParam<string>("categoryId", "");
        const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "");
        const shareWithEmployee = ctx.getParam<boolean>("options", {}).shareWithEmployee ?? false;
        const binaryData = (item.binary ?? {})[binaryPropertyName];
        const formData = new FormData();
        if (binaryData && typeof binaryData === "object" && "data" in binaryData) {
          const bytes = Uint8Array.from(atob(binaryData.data as string), c => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: (binaryData as { mimeType?: string }).mimeType ?? "application/octet-stream" });
          formData.append("file", blob, "upload");
        }
        if (shareWithEmployee) formData.append("shareWithEmployee", "true");
        const baseUrl = buildBaseUrl(credentials);
        const resp = await fetch(`${baseUrl}/v1/files/${categoryId}`, {
          method: "POST",
          headers: authHeaders(credentials),
          body: formData,
        });
        const text = await resp.text();
        let respBody: unknown;
        try { respBody = text ? JSON.parse(text) : {}; } catch { respBody = text; }
        if (!resp.ok) {
          const msg = typeof respBody === "object" && respBody !== null
            ? (respBody as Record<string, unknown>).error ?? (respBody as Record<string, unknown>).message ?? resp.statusText
            : resp.statusText;
          throw Object.assign(new Error(`BambooHR API error: ${msg}`), { status: resp.status, body: respBody });
        }
        result = (respBody as Record<string, unknown>) ?? { id: "uploaded" };
      } else {
        throw new Error(`Unsupported resource/operation: ${resource}/${operation}`);
      }

      const outItem: INodeExecutionData = { json: result, pairedItem };
      if (binaryAttachment) {
        outItem.binary = {
          data: { data: binaryAttachment.data, mimeType: binaryAttachment.mimeType, fileName: binaryAttachment.name },
        };
      }
      results.push(outItem);
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      results.push({ json: { error: { message, code }, ...item.json }, pairedItem });
    }
  }

  return [results];
};
