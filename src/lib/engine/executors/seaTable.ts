import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

export interface SeaTableClient {
  request(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
}

export type SeaTableClientFactory = (credentials: Record<string, unknown>) => Promise<SeaTableClient>;

let clientFactory: SeaTableClientFactory | null = null;

export function setSeaTableClientFactory(factory: SeaTableClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: SeaTableClientFactory = async (credentials) => {
  const environment = String(credentials.environment ?? "cloudHosted");
  const domain = String(credentials.domain ?? "https://cloud.seatable.io");
  const token = String(credentials.token ?? "");
  const baseUrl = domain.replace(/\/+$/, "");

  let baseToken: string | null = null;

  async function ensureBaseToken(): Promise<string> {
    if (baseToken) return baseToken;
    const resp = await fetch(`${baseUrl}/api/v2.1/dtable/app-access-token/`, {
      method: "POST",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
    });
    const data = await resp.json() as Record<string, unknown>;
    baseToken = String(data.access_token ?? "");
    return baseToken;
  }

  return {
    async request(method: string, path: string, body?: unknown) {
      const bt = await ensureBaseToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const headers: Record<string, string> = {
          Authorization: `Token ${bt}`,
          "Content-Type": "application/json",
        };
        const init: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) {
          init.body = JSON.stringify(body);
        }
        const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
        const resp = await fetch(url, init);
        const text = await resp.text();
        let respBody: unknown;
        try {
          respBody = text ? JSON.parse(text) : {};
        } catch {
          respBody = text;
        }
        return { status: resp.status, body: respBody };
      } finally {
        clearTimeout(timer);
      }
    },
  };
};

function getBaseParams(ctx: ExecutionContext): {
  resource: string;
  operation: string;
  tableName?: string;
  rowId?: string;
  columnValues?: Record<string, unknown>;
  linkedTableName?: string;
  linkedRowId?: string;
  columnName?: string;
  viewName?: string;
  snapshotName?: string;
  assetPath?: string;
  searchColumn?: string;
  searchValue?: string;
  offset?: number;
  limit?: number;
} {
  const resource = String(ctx.getParam("resource", "row"));
  const operation = String(ctx.getParam("operation", "create"));
  const tableName = ctx.getParam<string>("tableName");
  const rowId = ctx.getParam<string>("rowId");
  const columnValues = ctx.getParam<Record<string, unknown>>("columnValues");
  const linkedTableName = ctx.getParam<string>("linkedTableName");
  const linkedRowId = ctx.getParam<string>("linkedRowId");
  const columnName = ctx.getParam<string>("columnName");
  const viewName = ctx.getParam<string>("viewName");
  const snapshotName = ctx.getParam<string>("snapshotName");
  const assetPath = ctx.getParam<string>("assetPath");
  const searchColumn = ctx.getParam<string>("searchColumn");
  const searchValue = ctx.getParam<string>("searchValue");
  const offset = ctx.getParam<number>("offset");
  const limit = ctx.getParam<number>("limit");
  return { resource, operation, tableName, rowId, columnValues, linkedTableName, linkedRowId, columnName, viewName, snapshotName, assetPath, searchColumn, searchValue, offset, limit };
}

function mergeWithItemOverrides(
  base: ReturnType<typeof getBaseParams>,
  item: Record<string, unknown>,
): ReturnType<typeof getBaseParams> {
  return {
    resource: String(item.resource ?? base.resource),
    operation: String(item.operation ?? base.operation),
    tableName: item.tableName !== undefined ? String(item.tableName) : base.tableName,
    rowId: item.rowId !== undefined ? String(item.rowId) : base.rowId,
    columnValues: item.columnValues !== undefined ? (item.columnValues as Record<string, unknown>) : base.columnValues,
    linkedTableName: item.linkedTableName !== undefined ? String(item.linkedTableName) : base.linkedTableName,
    linkedRowId: item.linkedRowId !== undefined ? String(item.linkedRowId) : base.linkedRowId,
    columnName: item.columnName !== undefined ? String(item.columnName) : base.columnName,
    viewName: item.viewName !== undefined ? String(item.viewName) : base.viewName,
    snapshotName: item.snapshotName !== undefined ? String(item.snapshotName) : base.snapshotName,
    assetPath: item.assetPath !== undefined ? String(item.assetPath) : base.assetPath,
    searchColumn: item.searchColumn !== undefined ? String(item.searchColumn) : base.searchColumn,
    searchValue: item.searchValue !== undefined ? String(item.searchValue) : base.searchValue,
    offset: item.offset !== undefined ? Number(item.offset) : base.offset,
    limit: item.limit !== undefined ? Number(item.limit) : base.limit,
  };
}

function emitError(ctx: ExecutionContext, message: string): null {
  if (ctx.continueOnFail()) {
    return null;
  }
  throw new Error(message);
}

async function handleRowOperation(
  client: SeaTableClient,
  params: ReturnType<typeof getBaseParams>,
  ctx: ExecutionContext,
): Promise<Record<string, unknown> | null> {
  const { operation, tableName, rowId, columnValues, viewName, searchColumn, searchValue, offset, limit } = params;
  if (!tableName) return emitError(ctx, "tableName is required");

  const tablePath = `/api/v2.1/dtable/rows/${encodeURIComponent(tableName)}/`;

  switch (operation) {
    case "create": {
      const { status, body } = await client.request("POST", tablePath, columnValues ?? {});
      if (status >= 400) return emitError(ctx, `Create failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "get": {
      if (!rowId) return emitError(ctx, "rowId is required");
      const { status, body } = await client.request("GET", `${tablePath}${encodeURIComponent(rowId)}/`);
      if (status >= 400) return emitError(ctx, `Get failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "search": {
      if (!searchColumn || !searchValue) return emitError(ctx, "searchColumn and searchValue are required");
      const { status, body } = await client.request("POST", `${tablePath}query/`, {
        ...(columnValues ?? {}),
        search_column: searchColumn,
        search_value: searchValue,
      });
      if (status >= 400) return emitError(ctx, `Search failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "update": {
      if (!rowId) return emitError(ctx, "rowId is required");
      const { status, body } = await client.request("PUT", `${tablePath}${encodeURIComponent(rowId)}/`, columnValues ?? {});
      if (status >= 400) return emitError(ctx, `Update failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "remove": {
      if (!rowId) return emitError(ctx, "rowId is required");
      const { status, body } = await client.request("DELETE", `${tablePath}${encodeURIComponent(rowId)}/`);
      if (status >= 400) return emitError(ctx, `Remove failed: ${JSON.stringify(body)}`);
      return { success: true, ...(body as Record<string, unknown>) };
    }
    case "lock": {
      if (!rowId) return emitError(ctx, "rowId is required");
      const { status, body } = await client.request("PUT", `${tablePath}${encodeURIComponent(rowId)}/lock/`);
      if (status >= 400) return emitError(ctx, `Lock failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "unlock": {
      if (!rowId) return emitError(ctx, "rowId is required");
      const { status, body } = await client.request("PUT", `${tablePath}${encodeURIComponent(rowId)}/unlock/`);
      if (status >= 400) return emitError(ctx, `Unlock failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "list": {
      let qs = "";
      const qparams: string[] = [];
      if (viewName) qparams.push(`view_name=${encodeURIComponent(viewName)}`);
      if (offset !== undefined) qparams.push(`offset=${offset}`);
      if (limit !== undefined) qparams.push(`limit=${limit}`);
      if (qparams.length) qs = "?" + qparams.join("&");
      const { status, body } = await client.request("GET", `${tablePath}${qs}`);
      if (status >= 400) return emitError(ctx, `List failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    default:
      return emitError(ctx, `Unknown row operation: ${operation}`);
  }
}

async function handleBaseOperation(
  client: SeaTableClient,
  params: ReturnType<typeof getBaseParams>,
  ctx: ExecutionContext,
): Promise<Record<string, unknown> | null> {
  const { operation, snapshotName } = params;
  switch (operation) {
    case "metadata": {
      const { status, body } = await client.request("GET", "/api/v2.1/dtable/metadata/");
      if (status >= 400) return emitError(ctx, `Metadata failed: ${JSON.stringify(body)}`);
      return { metadata: body };
    }
    case "snapshot": {
      if (!snapshotName) return emitError(ctx, "snapshotName is required");
      const { status, body } = await client.request("POST", "/api/v2.1/dtable/snapshot/", { snapshot_name: snapshotName });
      if (status >= 400) return emitError(ctx, `Snapshot failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "collaborator": {
      const { status, body } = await client.request("GET", "/api/v2.1/dtable/collaborators/");
      if (status >= 400) return emitError(ctx, `Collaborator failed: ${JSON.stringify(body)}`);
      return { user_list: body };
    }
    default:
      return emitError(ctx, `Unknown base operation: ${operation}`);
  }
}

async function handleLinkOperation(
  client: SeaTableClient,
  params: ReturnType<typeof getBaseParams>,
  ctx: ExecutionContext,
): Promise<Record<string, unknown> | null> {
  const { operation, tableName, linkedTableName, rowId, linkedRowId, columnName } = params;
  switch (operation) {
    case "add": {
      if (!tableName || !linkedTableName || !rowId || !linkedRowId) {
        return emitError(ctx, "tableName, linkedTableName, rowId, and linkedRowId are required");
      }
      const { status, body } = await client.request("POST", "/api/v2.1/dtable/links/", {
        table_name: tableName,
        linked_table_name: linkedTableName,
        row_id: rowId,
        linked_row_id: linkedRowId,
      });
      if (status >= 400) return emitError(ctx, `Link add failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "list": {
      if (!tableName || !rowId || !columnName) {
        return emitError(ctx, "tableName, rowId, and columnName are required");
      }
      const { status, body } = await client.request("GET", `/api/v2.1/dtable/links/${encodeURIComponent(tableName)}/${encodeURIComponent(rowId)}/${encodeURIComponent(columnName)}/`);
      if (status >= 400) return emitError(ctx, `Link list failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    case "remove": {
      if (!tableName || !linkedTableName || !rowId || !linkedRowId) {
        return emitError(ctx, "tableName, linkedTableName, rowId, and linkedRowId are required");
      }
      const { status, body } = await client.request("DELETE", "/api/v2.1/dtable/links/", {
        table_name: tableName,
        linked_table_name: linkedTableName,
        row_id: rowId,
        linked_row_id: linkedRowId,
      });
      if (status >= 400) return emitError(ctx, `Link remove failed: ${JSON.stringify(body)}`);
      return { success: true, ...(body as Record<string, unknown>) };
    }
    default:
      return emitError(ctx, `Unknown link operation: ${operation}`);
  }
}

async function handleAssetOperation(
  client: SeaTableClient,
  params: ReturnType<typeof getBaseParams>,
  item: INodeExecutionData,
  ctx: ExecutionContext,
): Promise<Record<string, unknown> | null> {
  const { operation, assetPath } = params;
  switch (operation) {
    case "upload": {
      const binaryData = item.binary;
      const fileName = ctx.getParam<string>("fileName") ?? "upload.bin";
      if (!binaryData) return emitError(ctx, "Binary data is required for asset upload");

      const binaryKey = Object.keys(binaryData)[0];
      const binaryEntry = binaryData[binaryKey];
      let fileBuffer: ArrayBuffer;

      if (typeof binaryEntry.data === "string") {
        fileBuffer = Buffer.from(binaryEntry.data, "base64").buffer;
      } else if (binaryEntry.data instanceof ArrayBuffer) {
        fileBuffer = binaryEntry.data;
      } else {
        fileBuffer = new TextEncoder().encode(String(binaryEntry.data)).buffer;
      }

      const formData = new FormData();
      formData.append("file", new Blob([fileBuffer]), fileName);

      const credentials = (await ctx.getCredential("seaTableApi")) ?? {};
      const environment = String(credentials.environment ?? "cloudHosted");
      const domain = String(credentials.domain ?? "https://cloud.seatable.io");
      const token = String(credentials.token ?? "");
      const baseUrl = domain.replace(/\/+$/, "");

      const tokenResp = await fetch(`${baseUrl}/api/v2.1/dtable/app-access-token/`, {
        method: "POST",
        headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      });
      const tokenData = await tokenResp.json() as Record<string, unknown>;
      const bt = String(tokenData.access_token ?? "");

      const resp = await fetch(`${baseUrl}/api/v2.1/dtable/asset/upload/`, {
        method: "POST",
        headers: { Authorization: `Token ${bt}` },
        body: formData,
      });
      const text = await resp.text();
      let respBody: unknown;
      try {
        respBody = text ? JSON.parse(text) : {};
      } catch {
        respBody = text;
      }
      if (resp.status >= 400) return emitError(ctx, `Asset upload failed: ${JSON.stringify(respBody)}`);
      return respBody as Record<string, unknown>;
    }
    case "getPublicURL": {
      if (!assetPath) return emitError(ctx, "assetPath is required");
      const { status, body } = await client.request("POST", "/api/v2.1/dtable/asset/public-url/", { path: assetPath });
      if (status >= 400) return emitError(ctx, `Get public URL failed: ${JSON.stringify(body)}`);
      return body as Record<string, unknown>;
    }
    default:
      return emitError(ctx, `Unknown asset operation: ${operation}`);
  }
}

export const seaTableExecutor: NodeExecutor = async (ctx: ExecutionContext) => {
  const items = ensureItems(ctx.getInputItems(0));
  const factory = clientFactory ?? DEFAULT_FACTORY;
  const credentials = (await ctx.getCredential("seaTableApi")) ?? {};
  const client = await factory(credentials);
  const baseParams = getBaseParams(ctx);

  const results: INodeExecutionData[] = [];
  for (const item of items) {
    const params = mergeWithItemOverrides(baseParams, item.json);
    let result: Record<string, unknown> | null;

    switch (params.resource) {
      case "row":
        result = await handleRowOperation(client, params, ctx);
        break;
      case "base":
        result = await handleBaseOperation(client, params, ctx);
        break;
      case "link":
        result = await handleLinkOperation(client, params, ctx);
        break;
      case "asset":
        result = await handleAssetOperation(client, params, item, ctx);
        break;
      default:
        result = emitError(ctx, `Unknown resource: ${params.resource}`);
    }

    if (result === null) {
      results.push({ json: { error: `Operation failed: see node configuration` } });
    } else {
      results.push({ json: result });
    }
  }

  return [results];
};
