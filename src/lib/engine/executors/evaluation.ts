import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { withPairedItem } from "@/sdk";
import { resolveLocatorValue } from "@/lib/data-tables/access";

const EVALUATION_FLAG = "__evaluation__";
const METRICS_KEY = "__metrics__";
const DATA_TABLE_PREFIX = "__datatable__";

interface OutputValue {
  name?: unknown;
  value?: unknown;
}

export const evaluationExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "checkIfEvaluating");

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  if (operation === "checkIfEvaluating") {
    return handleCheckIfEvaluating(inputItems, ctx);
  }

  if (operation === "setMetrics") {
    return handleSetMetrics(inputItems, ctx);
  }

  if (operation === "setOutputs") {
    return await handleSetOutputs(inputItems, ctx);
  }

  return [inputItems.map((item, idx) => withPairedItem(item, idx))];
};

function handleCheckIfEvaluating(
  items: INodeExecutionData[],
  ctx: Parameters<NodeExecutor>[0],
): [INodeExecutionData[], INodeExecutionData[]] {
  const isEvaluating = ctx.getCustomData(EVALUATION_FLAG) === "true";
  if (isEvaluating) {
    return [items.map((item, idx) => withPairedItem(item, idx)), []];
  }
  return [[], items.map((item, idx) => withPairedItem(item, idx))];
}

function handleSetMetrics(
  items: INodeExecutionData[],
  ctx: Parameters<NodeExecutor>[0],
): [INodeExecutionData[]] {
  const metricsContainer = ctx.getParam<Record<string, unknown> | OutputValue[]>("metrics", {});
  const values = Array.isArray(metricsContainer)
    ? metricsContainer
    : Array.isArray((metricsContainer as Record<string, unknown>)?.values)
      ? ((metricsContainer as Record<string, unknown>).values as OutputValue[])
      : [];

  const existing = loadMetrics(ctx);
  for (const v of values) {
    const name = coerceToString(resolveValue(v.name, items, ctx));
    const rawValue = resolveValue(v.value, items, ctx);
    if (rawValue != null && typeof rawValue !== "number") {
      throw new Error(`Set Metrics: value for "${name}" must be numeric, got ${typeof rawValue}`);
    }
    existing.push({ name, value: rawValue });
  }
  ctx.setCustomData(METRICS_KEY, JSON.stringify(existing));

  return [items.map((item, idx) => withPairedItem(item, idx))];
}

async function handleSetOutputs(
  items: INodeExecutionData[],
  ctx: Parameters<NodeExecutor>[0],
): Promise<[INodeExecutionData[]]> {
  const source = ctx.getParam<string>("source", "dataTable");

  const values = collectOutputValues(ctx);

  if (source === "googleSheets") {
    void ctx.getCredential("googleSheetsOAuth2");
    const documentId = ctx.getParam<Record<string, unknown>>("documentId", {});
    const sheetId = ctx.getParam<Record<string, unknown>>("sheetId", {});
    if (!documentId?.value) {
      throw new Error("Set Outputs: documentId is required for Google Sheets source");
    }
    if (!sheetId?.value) {
      throw new Error("Set Outputs: sheetId is required for Google Sheets source");
    }
    ctx.setCustomData(
      `${DATA_TABLE_PREFIX}googleSheets`,
      JSON.stringify({
        documentId: documentId.value,
        sheetId: sheetId.value,
        outputs: values,
      }),
    );
    return [items.map((item, idx) => withPairedItem(item, idx))];
  }

  const tableRef =
    resolveLocatorValue(ctx.getParam<unknown>("dataTableId", null)) ||
    resolveLocatorValue(ctx.getParam<unknown>("dataTable", ""));
  if (!tableRef) {
    throw new Error("Set Outputs: data table is required when source is dataTable");
  }

  const resolved = values.map((v) => ({
    name: coerceToString(resolveValue(v.name, items, ctx)),
    value: resolveValue(v.value, items, ctx),
  }));

  const fields: Record<string, unknown> = {};
  for (const r of resolved) {
    if (r.name) fields[r.name] = r.value;
  }

  if (ctx.dataTables) {
    await ctx.dataTables.appendOutputRow(tableRef, fields);
  } else {
    ctx.setCustomData(`${DATA_TABLE_PREFIX}${tableRef}`, JSON.stringify(resolved));
  }

  return [items.map((item, idx) => withPairedItem(item, idx))];
}

function collectOutputValues(ctx: Parameters<NodeExecutor>[0]): OutputValue[] {
  const container = ctx.getParam<Record<string, unknown> | OutputValue[]>("outputs", {});
  if (Array.isArray(container)) return container;
  const raw = (container as Record<string, unknown>).values;
  return Array.isArray(raw) ? (raw as OutputValue[]) : [];
}

function loadMetrics(ctx: Parameters<NodeExecutor>[0]): Array<{ name: string; value: unknown }> {
  const raw = ctx.getCustomData(METRICS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveValue(
  raw: unknown,
  items: INodeExecutionData[],
  ctx: Parameters<NodeExecutor>[0],
): unknown {
  if (typeof raw === "string") {
    if (items.length > 0) {
      return ctx.evaluate(raw, items[0].json);
    }
    return raw;
  }
  return raw;
}

function coerceToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
