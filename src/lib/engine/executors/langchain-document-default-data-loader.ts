import type {
  NodeExecutor,
  INodeExecutionData,
  ExecutionContext,
  IWorkflow,
} from "@/sdk";

export interface DocumentLoaderHandle {
  type: "@n8n/n8n-nodes-langchain.documentDefaultDataLoader";
  load(): Promise<
    Array<{ pageContent: string; metadata: Record<string, unknown> }>
  >;
  [key: string]: unknown;
}

interface TextSplitterHandle {
  splitText?(text: string): Promise<string[]>;
  splitDocuments?(
    docs: Array<{
      pageContent: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<
    Array<{ pageContent: string; metadata?: Record<string, unknown> }>
  >;
  [key: string]: unknown;
}

interface SubNodeRef {
  name: string;
  index: number;
}

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

function findConnectedTextSplitter(
  connections: IWorkflow["connections"],
  nodeName: string,
): SubNodeRef | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (!t || t.node !== nodeName) continue;
          if (t.type === "ai_textSplitter") {
            return { name: sourceName, index: t.index ?? 0 };
          }
        }
      }
    }
  }
  return null;
}

function getTextSplitterHandle(
  ctx: ExecutionContext,
  name: string,
): TextSplitterHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as TextSplitterHandle;
}

function splitTextSimple(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  if (chunkSize <= 0) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - chunkOverlap;
    if (start >= text.length) break;
  }
  return chunks;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveDataParam(ctx: ExecutionContext, raw: unknown): string {
  if (typeof raw !== "string") return "";
  if (raw.includes("{{") || raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, firstItemJson(ctx));
    return resolved != null ? String(resolved) : "";
  }
  return raw;
}

function resolveMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    for (const entry of raw) {
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        const k = e.key;
        const v = e.value;
        if (k != null) out[String(k)] = v;
      }
    }
    return out;
  }
  return raw as Record<string, unknown>;
}

function loadJsonDocuments(items: INodeExecutionData[]): Document[] {
  const docs: Document[] = [];
  for (const item of items) {
    const json = item.json ?? {};
    for (const [, value] of Object.entries(json)) {
      if (typeof value === "string" && value.trim().length > 0) {
        docs.push({ pageContent: value, metadata: {} });
      }
    }
  }
  return docs;
}

function loadBinaryDocuments(
  items: INodeExecutionData[],
  dataFormat: string,
): Document[] {
  const docs: Document[] = [];
  for (const item of items) {
    if (!item.binary) continue;
    for (const [, binData] of Object.entries(item.binary)) {
      if (!binData.data) continue;
      const mimeType = binData.mimeType ?? "";
      if (dataFormat && dataFormat !== "auto") {
        if (mimeType !== dataFormat) {
          throw new Error(
            `Data format mismatch: expected ${dataFormat}, got ${mimeType || "unknown"}`,
          );
        }
      }
      docs.push({ pageContent: String(binData.data), metadata: { mimeType } });
    }
  }
  return docs;
}

async function splitDocuments(
  ctx: ExecutionContext,
  docs: Document[],
  textSplitter: string,
): Promise<Document[]> {
  if (textSplitter === "custom") {
    const workflow = ctx.getWorkflow();
    const splitterRef = findConnectedTextSplitter(
      workflow.connections,
      ctx.getNode().name,
    );
    if (!splitterRef) {
      throw new Error("A Text Splitter sub-node must be connected");
    }
    const splitterHandle = getTextSplitterHandle(ctx, splitterRef.name);
    if (!splitterHandle) {
      throw new Error("Text Splitter sub-node returned no handle");
    }
    if (typeof splitterHandle.splitDocuments === "function") {
      const split = await splitterHandle.splitDocuments(docs);
      return split.map((d) => ({
        pageContent: d.pageContent,
        metadata: d.metadata ?? {},
      }));
    }
    if (typeof splitterHandle.splitText === "function") {
      const results: Document[] = [];
      for (const doc of docs) {
        const chunks = await splitterHandle.splitText(doc.pageContent);
        for (const chunk of chunks) {
          results.push({ pageContent: chunk, metadata: doc.metadata });
        }
      }
      return results;
    }
    throw new Error(
      "Connected Text Splitter does not support splitDocuments or splitText",
    );
  }
  const results: Document[] = [];
  for (const doc of docs) {
    const chunks = splitTextSimple(doc.pageContent, CHUNK_SIZE, CHUNK_OVERLAP);
    for (const chunk of chunks) {
      results.push({ pageContent: chunk, metadata: doc.metadata });
    }
  }
  return results;
}

export const langchainDocumentDefaultDataLoaderExecutor: NodeExecutor = async (
  ctx,
) => {
  const textSplitter = ctx.getParam<string>("textSplitter", "simple");
  const dataType = ctx.getParam<string>("dataType", "json");
  const mode = ctx.getParam<string>("mode", "all");
  const dataFormat = ctx.getParam<string>("dataFormat", "auto");
  const metadata = resolveMetadata(ctx.getParam<unknown>("metadata", {}));

  const handle: DocumentLoaderHandle = {
    type: "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
    async load() {
      const inputItems = ctx.getInputItems(0);
      let docs: Document[];

      if (mode === "specific") {
        const data = resolveDataParam(ctx, ctx.getParam<unknown>("data", ""));
        docs = data.length > 0 ? [{ pageContent: data, metadata: {} }] : [];
      } else if (dataType === "binary") {
        docs = loadBinaryDocuments(inputItems, dataFormat);
      } else {
        docs = loadJsonDocuments(inputItems);
      }

      if (docs.length === 0) {
        return [];
      }

      const chunked = await splitDocuments(ctx, docs, textSplitter);

      return chunked.map((d) => ({
        pageContent: d.pageContent,
        metadata: { ...d.metadata, ...metadata },
      }));
    },
  };

  const out: INodeExecutionData[] = [
    { json: handle as unknown as Record<string, unknown> },
  ];
  return [out];
};