import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

export interface TextSplitterHandle {
  type: "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter";
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
  keepSeparator: boolean;
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

const DEFAULT_SEPARATORS = ["\n\n", "\n", " ", ""];

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

function resolveSeparators(ctx: ExecutionContext): string[] {
  const raw = ctx.getParam<unknown>("separators", undefined);
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s));
  }
  return DEFAULT_SEPARATORS;
}

function resolveBoolean(
  ctx: ExecutionContext,
  name: string,
  defaultValue: boolean,
): boolean {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return Boolean(ctx.evaluate(raw, firstItemJson(ctx)));
    }
    return raw === "true";
  }
  return defaultValue;
}

function splitBySeparator(
  text: string,
  separator: string,
  keepSeparator: boolean,
): string[] {
  if (separator === "") {
    return Array.from(text);
  }
  const parts = text.split(separator);
  if (keepSeparator) {
    return parts.map((p, i) => (i < parts.length - 1 ? p + separator : p));
  }
  return parts;
}

function mergeSplits(
  splits: string[],
  separator: string,
  chunkSize: number,
  chunkOverlap: number,
  keepSeparator: boolean,
): string[] {
  const joinSep = keepSeparator ? "" : separator;
  const sepLen = joinSep.length;
  const chunks: string[] = [];
  let current: string[] = [];
  let total = 0;

  for (const d of splits) {
    const dLen = d.length;
    if (total + dLen + (current.length > 0 ? sepLen : 0) > chunkSize) {
      if (current.length > 0) {
        const chunk = current.join(joinSep);
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
    const chunk = current.join(joinSep);
    if (chunk.length > 0) chunks.push(chunk);
  }

  return chunks;
}

function splitTextRecursive(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number,
  keepSeparator: boolean,
): string[] {
  const finalChunks: string[] = [];

  let separator = separators[separators.length - 1] ?? "";
  let newSeparators: string[] | undefined;
  for (let i = 0; i < separators.length; i++) {
    const s = separators[i];
    if (s === "") {
      separator = s;
      break;
    }
    if (text.includes(s)) {
      separator = s;
      newSeparators = separators.slice(i + 1);
      break;
    }
  }

  const splits = splitBySeparator(text, separator, keepSeparator);
  const goodSplits: string[] = [];

  for (const s of splits) {
    if (s.length < chunkSize) {
      goodSplits.push(s);
    } else {
      if (goodSplits.length > 0) {
        const merged = mergeSplits(
          goodSplits,
          separator,
          chunkSize,
          chunkOverlap,
          keepSeparator,
        );
        finalChunks.push(...merged);
        goodSplits.length = 0;
      }
      if (!newSeparators || newSeparators.length === 0) {
        finalChunks.push(s);
      } else {
        const subChunks = splitTextRecursive(
          s,
          newSeparators,
          chunkSize,
          chunkOverlap,
          keepSeparator,
        );
        finalChunks.push(...subChunks);
      }
    }
  }

  if (goodSplits.length > 0) {
    const merged = mergeSplits(
      goodSplits,
      separator,
      chunkSize,
      chunkOverlap,
      keepSeparator,
    );
    finalChunks.push(...merged);
  }

  return finalChunks;
}

export const langchainTextSplitterRecursiveCharacterExecutor: NodeExecutor = async (
  ctx,
) => {
  const chunkSize = resolveNumber(ctx, "chunkSize", 1000);
  const chunkOverlap = resolveNumber(ctx, "chunkOverlap", 200);
  const separators = resolveSeparators(ctx);
  const keepSeparator = resolveBoolean(ctx, "keepSeparator", true);

  if (chunkSize <= 0) {
    throw new Error("Chunk Size must be a positive number");
  }
  if (chunkOverlap >= chunkSize) {
    throw new Error("Chunk Overlap must be less than Chunk Size");
  }

  const handle: TextSplitterHandle = {
    type: "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
    chunkSize,
    chunkOverlap,
    separators,
    keepSeparator,
    async splitText(text: string): Promise<string[]> {
      if (!text) return [];
      return splitTextRecursive(
        text,
        separators,
        chunkSize,
        chunkOverlap,
        keepSeparator,
      );
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
        const chunks = splitTextRecursive(
          content,
          separators,
          chunkSize,
          chunkOverlap,
          keepSeparator,
        );
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