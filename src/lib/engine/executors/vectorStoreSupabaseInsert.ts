import type { NodeExecutor, ExecutionContext, INodeExecutionData, IWorkflow } from "@/sdk";
import { requireCredential, sdkHttpRequest } from "@/sdk";

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}

interface EmbeddingHandle {
  embedQuery: (text: string) => Promise<number[]>;
  embedDocuments: (texts: string[]) => Promise<number[][]>;
}

interface DocumentHandle {
  load: () => Promise<Document[]>;
}

interface SupabaseCredential {
  host: string;
  secretKey: string;
}

function findConnectedSubNode(
  connections: IWorkflow["connections"],
  targetName: string,
  channel: string,
): string | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    const outputs = channels[channel];
    if (!outputs) continue;
    for (const targets of outputs) {
      if (!targets) continue;
      for (const t of targets) {
        if (!t) continue;
        if (t.node === targetName) {
          return sourceName;
        }
      }
    }
  }
  return null;
}

function getHandle(ctx: ExecutionContext, sourceName: string): unknown | null {
  const items = ctx.getNodeInputItems(sourceName, 0);
  if (!items || items.length === 0) return null;
  return items[0].json;
}

function resolveStringParam(
  ctx: ExecutionContext,
  name: string,
  defaultValue: string,
  itemJson: Record<string, unknown>,
): string {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return String(ctx.evaluate(raw, itemJson) ?? defaultValue);
    }
    return raw;
  }
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    const rlValue = (raw as { value: string }).value;
    if (rlValue.startsWith("=")) {
      return String(ctx.evaluate(rlValue, itemJson) ?? defaultValue);
    }
    return rlValue;
  }
  return defaultValue;
}

function buildSupabaseHeaders(cred: SupabaseCredential): Record<string, string> {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "apiKey": cred.secretKey,
    "Authorization": `Bearer ${cred.secretKey}`,
  };
}

async function supabaseInsert(
  cred: SupabaseCredential,
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const url = `https://${cred.host}/rest/v1/${encodeURIComponent(tableName)}`;
  const res = await sdkHttpRequest({
    url,
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(cred),
      Prefer: "return=minimal",
    },
    body: rows,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Supabase insert failed: ${res.status}`);
  }
}

async function resolveCredential(ctx: ExecutionContext): Promise<SupabaseCredential> {
  const cred = await requireCredential(ctx, "supabaseApi");
  const host = String(cred.host ?? "");
  const secretKey = String(cred.secretKey ?? "");
  if (!host || !secretKey) {
    throw new Error("Supabase credential missing host or secretKey");
  }
  return { host, secretKey };
}

export const vectorStoreSupabaseInsertExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const outputItems: INodeExecutionData[] = [];

  const credential = await resolveCredential(ctx);

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    const item = inputItems[itemIndex];
    const itemJson = item.json ?? {};

    try {
      const tableName = resolveStringParam(ctx, "tableName", "", itemJson);
      if (!tableName) {
        throw new Error("tableName parameter is required");
      }
      const queryName = resolveStringParam(ctx, "queryName", "match_documents", itemJson);

      const embeddingSourceName = findConnectedSubNode(
        ctx.getWorkflow().connections,
        node.name,
        "ai_embedding",
      );
      if (!embeddingSourceName) {
        throw new Error("An Embedding sub-node must be connected");
      }
      const embeddingHandle = getHandle(ctx, embeddingSourceName) as EmbeddingHandle | null;
      if (!embeddingHandle || typeof embeddingHandle.embedDocuments !== "function") {
        throw new Error("An Embedding sub-node must be connected");
      }

      const documentSourceName = findConnectedSubNode(
        ctx.getWorkflow().connections,
        node.name,
        "ai_document",
      );
      if (!documentSourceName) {
        throw new Error("A Document Loader sub-node must be connected");
      }
      const documentHandle = getHandle(ctx, documentSourceName) as DocumentHandle | null;
      if (!documentHandle || typeof documentHandle.load !== "function") {
        throw new Error("A Document Loader sub-node must be connected");
      }

      const documents = await documentHandle.load();
      const texts = documents.map((d) => d.pageContent);
      const embeddings = await embeddingHandle.embedDocuments(texts);
      const rows = documents.map((doc, i) => ({
        content: doc.pageContent,
        metadata: doc.metadata ?? {},
        embedding: embeddings[i],
      }));
      await supabaseInsert(credential, tableName, rows);
      outputItems.push({ ...item });
    } catch (error) {
      if (!ctx.continueOnFail()) {
        throw error;
      }
      outputItems.push({
        json: { error: error instanceof Error ? error.message : String(error) },
        pairedItem: { item: itemIndex, input: 0 },
      });
    }
  }

  return [outputItems];
};
