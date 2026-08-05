import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, ensureItems } from "@/sdk";

const FIRESTORE_API_BASE = "https://firestore.googleapis.com/v1";

function resolveValue(
  raw: unknown,
  itemJson: Record<string, unknown>,
  ctx: { evaluate: (expr: string, json: Record<string, unknown>) => unknown },
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return fallback;
  return String(v);
}

interface FirestoreCredentials {
  accessToken?: string;
  data?: Record<string, unknown>;
}

function parseColumns(raw: unknown, itemJson: Record<string, unknown>, ctx: { evaluate: (expr: string, json: Record<string, unknown>) => unknown }): Record<string, unknown> {
  if (!raw) return {};
  const resolved = resolveValue(raw, itemJson, ctx);
  if (typeof resolved === "object" && resolved !== null) return resolved as Record<string, unknown>;
  try {
    return JSON.parse(asString(resolved, "{}"));
  } catch {
    return {};
  }
}

function buildDocumentPath(projectId: string, database: string, collection: string, documentId?: string): string {
  let path = `projects/${projectId}/databases/${database}/documents/${collection}`;
  if (documentId) {
    path += `/${documentId}`;
  }
  return path;
}

function makeSimpleDoc(name: string, createTime?: string, updateTime?: string) {
  const parts = name.split("/");
  const _id = parts[parts.length - 1];
  return {
    _id,
    _name: name,
    _createTime: createTime ?? "",
    _updateTime: updateTime ?? "",
  };
}

export const googleFirebaseCloudFirestoreExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  const projectId = asString(ctx.getParam("projectId"));
  const database = asString(ctx.getParam("database"), "(default)");
  const resource = asString(ctx.getParam("resource"), "document");
  const operation = asString(ctx.getParam("operation"));

  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  const credential = await ctx.getCredential("googleFirebaseCloudFirestoreOAuth2Api") as FirestoreCredentials | null;
  const accessToken =
    credential?.accessToken ??
    (credential?.data as Record<string, unknown>)?.accessToken ??
    (await ctx.getCredential("googleApi"))?.accessToken ??
    "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  for (const item of items) {
    try {
      if (resource === "document") {
        const collection = asString(resolveValue(ctx.getParam("collection"), item.json, ctx));
        if (!collection && operation !== "query") throw new Error("Collection parameter is required for document operations.");

        switch (operation) {
          case "create": {
            const documentId = asString(resolveValue(ctx.getParam("documentId"), item.json, ctx));
            const columns = parseColumns(ctx.getParam("columns"), item.json, ctx);
            const simple = ctx.getParam<boolean>("simple", true);

            let url: string;
            let method: string;
            let body: Record<string, unknown>;

            if (documentId) {
              const docPath = buildDocumentPath(projectId, database, collection, documentId);
              url = `${FIRESTORE_API_BASE}/${docPath}`;
              method = "PATCH";
              body = { fields: toFirestoreFields(columns) };
            } else {
              const parentPath = buildDocumentPath(projectId, database, collection);
              url = `${FIRESTORE_API_BASE}/${parentPath}`;
              method = "POST";
              body = { fields: toFirestoreFields(columns) };
            }

            const res = await sdkHttpRequest({ method, url, headers, body });
            if (res.status < 200 || res.status >= 300) throw apiError(res);

            const data = res.body as Record<string, unknown>;
            if (simple) {
              out.push({ json: makeSimpleDoc(asString(data.name), asString(data.createTime), asString(data.updateTime)) });
            } else {
              out.push({ json: data });
            }
            break;
          }

          case "upsert": {
            const updateKey = asString(resolveValue(ctx.getParam("updateKey"), item.json, ctx));
            const columns = parseColumns(ctx.getParam("columns"), item.json, ctx);
            const docId = updateKey ? asString(item.json[updateKey]) : undefined;

            let url: string;
            let method: string;
            const parentPath = buildDocumentPath(projectId, database, collection);
            if (docId) {
              url = `${FIRESTORE_API_BASE}/${parentPath}/${docId}`;
              method = "PATCH";
            } else {
              url = `${FIRESTORE_API_BASE}/${parentPath}`;
              method = "POST";
            }

            const res = await sdkHttpRequest({ method, url, headers, body: { fields: toFirestoreFields(columns) } });
            if (res.status < 200 || res.status >= 300) throw apiError(res);

            const data = res.body as Record<string, unknown>;
            out.push({ json: { updateTime: data.updateTime ?? "" } });
            break;
          }

          case "get": {
            const documentId = asString(resolveValue(ctx.getParam("documentId"), item.json, ctx));
            if (!documentId) throw new Error("Document ID is required for get operation.");
            const simple = ctx.getParam<boolean>("simple", true);

            const docPath = buildDocumentPath(projectId, database, collection, documentId);
            const res = await sdkHttpRequest({ method: "GET", url: `${FIRESTORE_API_BASE}/${docPath}`, headers });
            if (res.status < 200 || res.status >= 300) throw apiError(res);

            const data = res.body as Record<string, unknown>;
            if (simple) {
              out.push({ json: makeSimpleDoc(asString(data.name), asString(data.createTime), asString(data.updateTime)) });
            } else {
              out.push({ json: data });
            }
            break;
          }

          case "getAll": {
            const returnAll = ctx.getParam<boolean>("returnAll", false);
            const limit = ctx.getParam<number>("limit", 100);
            const simple = ctx.getParam<boolean>("simple", true);

            const parentPath = buildDocumentPath(projectId, database, collection);
            let url = `${FIRESTORE_API_BASE}/${parentPath}`;
            if (!returnAll) url += `?pageSize=${limit}`;

            const res = await sdkHttpRequest({ method: "GET", url, headers });
            if (res.status < 200 || res.status >= 300) throw apiError(res);

            const data = res.body as Record<string, unknown>;
            const docs = (data.documents as Array<Record<string, unknown>>) ?? [];
            let results: Array<Record<string, unknown>>;
            if (simple) {
              results = docs.map((d) => makeSimpleDoc(asString(d.name), asString(d.createTime), asString(d.updateTime)));
            } else {
              results = docs;
            }

            out.push({ json: results });
            break;
          }

          case "delete": {
            const documentId = asString(resolveValue(ctx.getParam("documentId"), item.json, ctx));
            if (!documentId) throw new Error("Document ID is required for delete operation.");

            const docPath = buildDocumentPath(projectId, database, collection, documentId);
            const res = await sdkHttpRequest({ method: "DELETE", url: `${FIRESTORE_API_BASE}/${docPath}`, headers });
            if (res.status < 200 || res.status >= 300) throw apiError(res);

            out.push({ json: { success: true } });
            break;
          }

          case "query": {
            const queryRaw = resolveValue(ctx.getParam("query"), item.json, ctx);
            const simple = ctx.getParam<boolean>("simple", true);

            const parentPath = `projects/${projectId}/databases/${database}/documents`;
            const query = typeof queryRaw === "string" ? JSON.parse(queryRaw) : queryRaw;

            const res = await sdkHttpRequest({
              method: "POST",
              url: `${FIRESTORE_API_BASE}/${parentPath}:runQuery`,
              headers,
              body: query,
            });
            if (res.status < 200 || res.status >= 300) throw apiError(res);

            const data = res.body as Record<string, unknown>;
            const results = (data as unknown as Array<Record<string, unknown>>) ?? [];
            let formatted: Array<Record<string, unknown>>;
            if (simple) {
              formatted = results
                .filter((r) => r.document)
                .map((r) => {
                  const doc = r.document as Record<string, unknown>;
                  return makeSimpleDoc(asString(doc.name), asString(doc.createTime), asString(doc.updateTime));
                });
            } else {
              formatted = results;
            }
            out.push({ json: formatted });
            break;
          }

          default:
            throw new Error(`Unknown document operation: ${operation}`);
        }
      } else if (resource === "collection") {
        if (operation === "getAll") {
          const returnAll = ctx.getParam<boolean>("returnAll", false);
          const limit = ctx.getParam<number>("limit", 100);

          const parentPath = `projects/${projectId}/databases/${database}/documents`;
          let url = `${FIRESTORE_API_BASE}/${parentPath}:listCollectionIds`;
          if (!returnAll) url += `?pageSize=${limit}`;

          const res = await sdkHttpRequest({ method: "POST", url, headers, body: {} });
          if (res.status < 200 || res.status >= 300) throw apiError(res);

          const data = res.body as Record<string, unknown>;
          const collectionIds = (data.collectionIds as string[]) ?? [];
          const results = collectionIds.map((cid) => ({
            name: `${parentPath}/${cid}`,
          }));
          out.push({ json: results });
        } else {
          throw new Error(`Unknown collection operation: ${operation}`);
        }
      } else {
        throw new Error(`Unknown resource: ${resource}`);
      }
    } catch (err) {
      if (continueOnFail) {
        out.push({ json: { error: err instanceof Error ? err.message : String(err) } });
      } else {
        throw err;
      }
    }
  }

  return [out];
};

function toFirestoreFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: value };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (value === null) {
      fields[key] = { nullValue: null };
    } else if (Array.isArray(value)) {
      fields[key] = { arrayValue: { values: value.map((v) => ({ stringValue: String(v) })) } };
    } else if (typeof value === "object") {
      fields[key] = { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
    }
  }
  return fields;
}

function apiError(res: { status: number; body?: unknown }): Error {
  const errBody = res.body as Record<string, unknown> | undefined;
  const msg =
    ((errBody?.error as Record<string, unknown>)?.message as string) ??
    `Firestore API returned HTTP ${res.status}`;
  return new Error(msg);
}
