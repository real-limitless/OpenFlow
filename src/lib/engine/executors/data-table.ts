import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";
import { resolveLocatorValue } from "@/lib/data-tables/access";

export const dataTableExecutor: NodeExecutor = async (ctx) => {
  const operation = ctx.getParam<string>("operation", "manual");

  if (operation === "manual" || !operation) {
    return executeManual(ctx);
  }

  const tableRef = resolveLocatorValue(ctx.getParam<unknown>("dataTableId", { mode: "list", value: "" }));
  if (!tableRef) {
    throw new Error("Data table is required for this operation");
  }
  if (!ctx.dataTables) {
    throw new Error("Data tables store is not available in this execution environment");
  }

  const inputItems = ctx.getInputItems(0);

  if (operation === "get") {
    const limit = ctx.getParam<number | undefined>("limit", undefined);
    const search = ctx.getParam<string>("search", "") || undefined;
    const rows = await ctx.dataTables.loadRows(tableRef, {
      limit: typeof limit === "number" && limit > 0 ? limit : undefined,
      search,
    });
    const items: INodeExecutionData[] = rows.map((row, idx) => {
      const { _rowId, ...json } = row;
      return {
        json: { ...json, ...( _rowId ? { _rowId } : {}) },
        pairedItem: { item: idx, input: 0 },
      };
    });
    return [items.length > 0 ? items : [{ json: {} }]];
  }

  if (operation === "insert") {
    const mapFromInput = ctx.getParam<boolean>("mapFromInput", true);
    const rows: Record<string, unknown>[] = [];
    if (mapFromInput && inputItems.length > 0) {
      for (const item of inputItems) {
        rows.push({ ...item.json });
      }
    } else {
      const raw = ctx.getParam("tableData");
      for (const row of toArray(raw)) {
        rows.push(toObject(row, 0, inputItems));
      }
    }
    const count = await ctx.dataTables.insertRows(tableRef, rows);
    return [[{ json: { inserted: count } }]];
  }

  if (operation === "update") {
    const matchColumn = ctx.getParam<string>("matchColumn", "");
    const matchValue = ctx.getParam<unknown>("matchValue", "");
    if (!matchColumn) throw new Error("Match column is required for update");
    const fieldsRaw = ctx.getParam("fields", {});
    const fields =
      typeof fieldsRaw === "object" && fieldsRaw !== null && !Array.isArray(fieldsRaw)
        ? (fieldsRaw as Record<string, unknown>)
        : {};
    // Prefer first input item fields if mapFromInput
    const mapFromInput = ctx.getParam<boolean>("mapFromInput", true);
    const updateFields =
      mapFromInput && inputItems[0]
        ? { ...inputItems[0].json, ...fields }
        : fields;
    const resolvedMatch = (() => {
      if (typeof matchValue !== "string") return matchValue;
      const r = evaluateExpression(matchValue, {
        json: inputItems[0]?.json ?? {},
        itemIndex: 0,
      });
      return r.ok ? r.value : matchValue;
    })();
    const count = await ctx.dataTables.updateRows(
      tableRef,
      { column: matchColumn, value: resolvedMatch },
      updateFields,
    );
    return [[{ json: { updated: count } }]];
  }

  if (operation === "delete") {
    const matchColumn = ctx.getParam<string>("matchColumn", "");
    const matchValue = ctx.getParam<unknown>("matchValue", "");
    if (!matchColumn) {
      throw new Error("Match column is required for delete (use clear to remove all rows)");
    }
    const resolvedMatch =
      typeof matchValue === "string" && inputItems[0]
        ? (() => {
            const r = evaluateExpression(matchValue, {
              json: inputItems[0].json,
              itemIndex: 0,
            });
            return r.ok ? r.value : matchValue;
          })()
        : matchValue;
    const count = await ctx.dataTables.deleteRows(tableRef, {
      column: matchColumn,
      value: resolvedMatch,
    });
    return [[{ json: { deleted: count } }]];
  }

  if (operation === "clear") {
    const count = await ctx.dataTables.clearRows(tableRef);
    return [[{ json: { deleted: count } }]];
  }

  throw new Error(`Unknown DataTable operation: ${operation}`);
};

function executeManual(ctx: Parameters<NodeExecutor>[0]): Promise<INodeExecutionData[][]> {
  const inputItems = ctx.getInputItems(0);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const keepInput = options.keepInput === true;

  const rawTableData = ctx.getParam("tableData");
  const rows = toArray(rawTableData);

  if (rows.length === 0) {
    return Promise.resolve([[{ json: {} }]]);
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

  return Promise.resolve([out]);
}

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
