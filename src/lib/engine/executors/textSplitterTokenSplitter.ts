import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

export interface TokenSplitterHandle {
  type: "@n8n/n8n-nodes-langchain.textSplitterTokenSplitter";
  chunkSize: number;
  chunkOverlap: number;
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

function encode(text: string): number[] {
  const tokens: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      tokens.push(code);
    } else if (code < 2048) {
      tokens.push(192 | (code >> 6), 128 | (code & 63));
    } else {
      tokens.push(
        224 | (code >> 12),
        128 | ((code >> 6) & 63),
        128 | (code & 63),
      );
    }
  }
  return tokens;
}

function decode(tokens: number[]): string {
  return String.fromCharCode(...tokens.filter((t) => t < 65536));
}

function mergeTokenSplits(
  tokens: number[],
  chunkSize: number,
  chunkOverlap: number,
): number[][] {
  if (chunkSize <= 0) return [];
  if (tokens.length === 0) return [];
  const step = chunkSize - chunkOverlap;
  if (step <= 0) return [tokens];

  const chunks: number[][] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(start + chunkSize, tokens.length);
    chunks.push(tokens.slice(start, end));
    if (end >= tokens.length) break;
    start += step;
  }
  return chunks;
}

export const textSplitterTokenSplitterExecutor: NodeExecutor = async (ctx) => {
  const chunkSize = resolveNumber(ctx, "chunkSize", 1000);
  const chunkOverlap = resolveNumber(ctx, "chunkOverlap", 0);

  if (chunkSize <= 0) {
    throw new Error("Chunk Size must be a positive number");
  }
  if (chunkOverlap >= chunkSize) {
    throw new Error("Chunk Overlap must be less than Chunk Size");
  }

  const handle: TokenSplitterHandle = {
    type: "@n8n/n8n-nodes-langchain.textSplitterTokenSplitter",
    chunkSize,
    chunkOverlap,
    async splitText(text: string): Promise<string[]> {
      if (!text) return [];
      const tokens = encode(text);
      const tokenChunks = mergeTokenSplits(tokens, chunkSize, chunkOverlap);
      return tokenChunks.map((tc) => decode(tc));
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
        const tokens = encode(content);
        const tokenChunks = mergeTokenSplits(tokens, chunkSize, chunkOverlap);
        for (const tc of tokenChunks) {
          results.push({ pageContent: decode(tc), metadata: { ...metadata } });
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
