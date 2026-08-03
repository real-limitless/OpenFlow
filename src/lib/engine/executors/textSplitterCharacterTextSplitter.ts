import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

export interface TextSplitterHandle {
  type: "@n8n/n8n-nodes-langchain.textSplitterCharacterTextSplitter";
  chunkSize: number;
  chunkOverlap: number;
  separator: string;
  splitText(text: string): Promise<string[]>;
  splitDocuments(
    docs: Array<{
      pageContent: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<
    Array<{ pageContent: string; metadata: Record<string, unknown> }>
  >;
  [key: string]: unknown;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveNumber(
  ctx: ExecutionContext,
  name: string,
  defaultValue: number,
): number {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  let n: number;
  if (typeof raw === "string" && raw.startsWith("=")) {
    n = Number(ctx.evaluate(raw, firstItemJson(ctx)) ?? defaultValue);
  } else {
    n = Number(raw ?? defaultValue);
  }
  if (!Number.isFinite(n)) return defaultValue;
  return Math.floor(n);
}

function resolveString(
  ctx: ExecutionContext,
  name: string,
  defaultValue: string,
): string {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "string" && raw.startsWith("=")) {
    return String(ctx.evaluate(raw, firstItemJson(ctx)) ?? defaultValue);
  }
  return String(raw ?? defaultValue);
}

function splitTextBySeparator(
  text: string,
  separator: string,
): string[] {
  if (separator === "") {
    return Array.from(text);
  }
  return text.split(separator);
}

function mergeSplits(
  splits: string[],
  separator: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const sepLen = separator.length;
  const chunks: string[] = [];
  let current: string[] = [];
  let total = 0;

  for (const d of splits) {
    const dLen = d.length;
    if (total + dLen + (current.length > 0 ? sepLen : 0) > chunkSize) {
      if (current.length > 0) {
        const chunk = current.join(separator);
        if (chunk.length > 0) chunks.push(chunk);
        while (
          total > chunkOverlap ||
          (total + dLen + (current.length > 0 ? sepLen : 0) > chunkSize &&
            total > 0)
        ) {
          total -= current[0]!.length + (current.length > 1 ? sepLen : 0);
          current.shift();
          if (current.length === 0) break;
        }
      }
    }
    current.push(d);
    total += dLen + (current.length > 1 ? sepLen : 0);
  }

  if (current.length > 0) {
    const chunk = current.join(separator);
    if (chunk.length > 0) chunks.push(chunk);
  }

  return chunks;
}

export const textSplitterCharacterTextSplitterExecutor: NodeExecutor = async (
  ctx,
) => {
  const separator = resolveString(ctx, "separator", "");
  const chunkSize = resolveNumber(ctx, "chunkSize", 1000);
  const chunkOverlap = resolveNumber(ctx, "chunkOverlap", 0);

  if (chunkSize <= 0) {
    throw new Error("Chunk Size must be a positive number");
  }
  if (chunkOverlap >= chunkSize) {
    throw new Error("Chunk Overlap must be less than Chunk Size");
  }

  const handle: TextSplitterHandle = {
    type: "@n8n/n8n-nodes-langchain.textSplitterCharacterTextSplitter",
    chunkSize,
    chunkOverlap,
    separator,
    async splitText(text: string): Promise<string[]> {
      if (!text) return [];
      const splits = splitTextBySeparator(text, separator);
      return mergeSplits(splits, separator, chunkSize, chunkOverlap);
    },
    async splitDocuments(docs) {
      const results: Array<{
        pageContent: string;
        metadata: Record<string, unknown>;
      }> = [];
      for (const doc of docs) {
        const content = doc.pageContent ?? "";
        const metadata = doc.metadata ?? {};
        if (!content) continue;
        const splits = splitTextBySeparator(content, separator);
        const chunks = mergeSplits(splits, separator, chunkSize, chunkOverlap);
        for (const chunk of chunks) {
          results.push({ pageContent: chunk, metadata: { ...metadata } });
        }
      }
      return results;
    },
  };

  const out: INodeExecutionData[] = [
    { json: handle as unknown as Record<string, unknown> },
  ];
  return [out];
};
