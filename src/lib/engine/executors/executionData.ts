import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { withPairedItem } from "@/sdk";

const KEY_MAX = 50;
const VALUE_MAX = 512;

interface SavedField {
  key?: unknown;
  value?: unknown;
}

export const executionDataExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const fields = collectSavedFields(ctx);

  const out: INodeExecutionData[] = inputItems.map((item, idx) => {
    for (const field of fields) {
      const key = truncate(coerceToString(resolveValue(field.key, item, ctx)), KEY_MAX, "key");
      const value = truncate(
        coerceToString(resolveValue(field.value, item, ctx)),
        VALUE_MAX,
        "value",
      );
      ctx.setCustomData(key, value);
    }
    return withPairedItem(item, idx);
  });

  return [out];
};

function collectSavedFields(ctx: Parameters<NodeExecutor>[0]): SavedField[] {
  const container = ctx.getParam<Record<string, unknown> | SavedField[]>("dataToSave", {}) ?? {};
  if (Array.isArray(container)) return container as SavedField[];
  const values = (container as Record<string, unknown>).values;
  return Array.isArray(values) ? (values as SavedField[]) : [];
}

function resolveValue(
  raw: unknown,
  item: INodeExecutionData,
  ctx: Parameters<NodeExecutor>[0],
): unknown {
  if (typeof raw === "string") {
    return ctx.evaluate(raw, item.json);
  }
  return raw;
}

function coerceToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function truncate(s: string, max: number, what: string): string {
  if (s.length <= max) return s;
  console.warn(`[executionData] ${what} truncated to ${max} characters`);
  return s.slice(0, max);
}
