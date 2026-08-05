import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems, withPairedItem } from "@/sdk";

const CODA_API = "https://coda.io/apis/v1";

function buildUrl(resource: string, operation: string, params: Record<string, string>): string {
  const docId = params.docId;
  switch (resource) {
    case "Control": {
      if (operation === "getAll") return `${CODA_API}/docs/${docId}/controls`;
      return `${CODA_API}/docs/${docId}/controls/${params.controlId}`;
    }
    case "Formula": {
      if (operation === "getAll") return `${CODA_API}/docs/${docId}/formulas`;
      return `${CODA_API}/docs/${docId}/formulas/${params.formulaId}`;
    }
    case "Table": {
      const tableId = params.tableId;
      switch (operation) {
        case "getAllRows": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows`;
        case "createRow": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows`;
        case "deleteRows": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows`;
        case "getRow": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows/${params.rowId}`;
        case "getColumn": return `${CODA_API}/docs/${docId}/tables/${tableId}/columns/${params.columnId}`;
        case "getAllColumns": return `${CODA_API}/docs/${docId}/tables/${tableId}/columns`;
        case "pushButton": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows/${params.rowId}/button`;
        default: return `${CODA_API}/docs/${docId}/tables/${tableId}/rows`;
      }
    }
    case "View": {
      const tableId = params.tableId;
      switch (operation) {
        case "getView": return `${CODA_API}/docs/${docId}/tables/${tableId}/views/${params.viewId}`;
        case "getAllViews": return `${CODA_API}/docs/${docId}/tables/${tableId}/views`;
        case "getAllViewColumns": return `${CODA_API}/docs/${docId}/tables/${tableId}/views/${params.viewId}/columns`;
        case "getAllViewRows": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows?viewId=${params.viewId}`;
        case "deleteViewRow": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows/${params.rowId}`;
        case "updateViewRow": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows/${params.rowId}`;
        case "pushViewButton": return `${CODA_API}/docs/${docId}/tables/${tableId}/rows/${params.rowId}/button`;
        default: return `${CODA_API}/docs/${docId}/tables/${tableId}`;
      }
    }
    default:
      return `${CODA_API}/docs/${docId}`;
  }
}

function buildMethod(resource: string, operation: string): string {
  switch (operation) {
    case "createRow":
    case "pushButton":
    case "pushViewButton":
      return "POST";
    case "deleteRows":
    case "deleteViewRow":
      return "DELETE";
    case "updateViewRow":
      return "PUT";
    default:
      return "GET";
  }
}

function buildBody(resource: string, operation: string, dataRaw: unknown): unknown | undefined {
  if (operation === "createRow" && dataRaw) {
    return dataRaw;
  }
  return undefined;
}

async function codaFetch(
  url: string,
  method: string,
  body: unknown | undefined,
  credential: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (credential?.accessToken) {
    headers["Authorization"] = `Bearer ${String(credential.accessToken)}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Coda API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export const codaToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "Table");
  const operation = String(node.parameters.operation ?? "getAllRows");
  const continueOnFail = ctx.continueOnFail();
  const credential = await ctx.getCredential("codaApi");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const docId = String(node.parameters.docId ?? "");
      const tableId = String(node.parameters.tableId ?? "");
      const viewId = String(node.parameters.viewId ?? "");
      const rowId = String(node.parameters.rowId ?? "");
      const columnId = String(node.parameters.columnId ?? "");
      const controlId = String(node.parameters.controlId ?? "");
      const formulaId = String(node.parameters.formulaId ?? "");
      const dataRaw = node.parameters.data;

      const params: Record<string, string> = { docId, tableId, viewId, rowId, columnId, controlId, formulaId };
      const url = buildUrl(resource, operation, params);
      const method = buildMethod(resource, operation);
      const body = buildBody(resource, operation, dataRaw);

      const json = await codaFetch(url, method, body, credential);
      out.push({ json, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
