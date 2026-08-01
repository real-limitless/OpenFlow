import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

export interface ItemListParserHandle {
  type: "@n8n/n8n-nodes-langchain.outputParserItemList";
  numberOfItems: number;
  separator: string;
  parse(text: string): string[];
  [key: string]: unknown;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveStringParam(ctx: ExecutionContext, name: string): string {
  const raw = ctx.getParam<unknown>(name, "");
  if (typeof raw !== "string") return "";
  if (raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, firstItemJson(ctx));
    return resolved != null ? String(resolved) : "";
  }
  return raw;
}

function resolveNumberParam(ctx: ExecutionContext, name: string): number | null {
  const raw = ctx.getParam<unknown>(name, -1);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      const resolved = ctx.evaluate(raw, firstItemJson(ctx));
      if (resolved == null) return null;
      const n = Number(resolved);
      return Number.isNaN(n) ? null : n;
    }
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export const langchainOutputParserItemListExecutor: NodeExecutor = async (ctx) => {
  const separator = resolveStringParam(ctx, "separator") || "\n";
  const numberOfItemsRaw = resolveNumberParam(ctx, "numberOfItems");

  if (numberOfItemsRaw === null) {
    throw new Error("Item List Output Parser: numberOfItems must resolve to a valid number");
  }

  if (separator === "") {
    throw new Error("Item List Output Parser: separator must not be empty");
  }

  const handle: ItemListParserHandle = {
    type: "@n8n/n8n-nodes-langchain.outputParserItemList",
    numberOfItems: numberOfItemsRaw,
    separator,
    parse: (text: string) => {
      const items = text.split(separator);
      if (numberOfItemsRaw === -1) return items;
      return items.slice(0, numberOfItemsRaw);
    },
  };

  const out: INodeExecutionData[] = [
    { json: handle as unknown as Record<string, unknown> },
  ];
  return [out];
};
