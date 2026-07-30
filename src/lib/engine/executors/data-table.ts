import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

export const dataTableExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const keepInput = options.keepInput === true;

  const rawTableData = ctx.getParam("tableData");
  const rows = toArray(rawTableData);

  if (rows.length === 0) {
    return [[{ json: {} }]];
  }

  const out: INodeExecutionData[] = rows.map((row, idx) => {
    const obj = toObject(row, idx, inputItems);
    if (keepInput && idx < inputItems.length) {
      const base = inputItems[idx];
      return {
        json: { ...base.json, ...obj },
        binary: base.binary,
        pairedItem: base.pairedItem ?? { item: idx, input: 0 },
      };
    }
    return { json: obj, pairedItem: { item: idx, input: 0 } };
  });

  return [out];
};

function toArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toObject(
  row: unknown,
  idx: number,
  inputItems: INodeExecutionData[],
): Record<string, unknown> {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return { value: row };
  }

  const source = row as Record<string, unknown>;
  const itemJson = idx < inputItems.length ? inputItems[idx].json : {};
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      const evalResult = evaluateExpression(value, { json: itemJson, itemIndex: idx });
      result[key] = evalResult.ok ? evalResult.value : value;
    } else {
      result[key] = value;
    }
  }

  return result;
}
