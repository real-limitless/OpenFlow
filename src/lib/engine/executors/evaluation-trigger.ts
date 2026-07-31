import type { NodeExecutor, INodeExecutionData } from "@/sdk";

function matchRow(
  row: Record<string, unknown>,
  condition: { keyName: string; condition: string; keyValue: string },
): boolean {
  const val = String(row[condition.keyName] ?? "");
  switch (condition.condition) {
    case "eq":
      return val === condition.keyValue;
    case "ne":
      return val !== condition.keyValue;
    case "contains":
      return val.includes(condition.keyValue);
    case "notContains":
      return !val.includes(condition.keyValue);
    case "gt":
      return Number(val) > Number(condition.keyValue);
    case "lt":
      return Number(val) < Number(condition.keyValue);
    default:
      return false;
  }
}

export const evaluationTriggerExecutor: NodeExecutor = async (ctx) => {
  const source = ctx.getParam<string>("source", "dataTable");

  let rows: Record<string, unknown>[] = [];

  if (source === "dataTable") {
    const dataTableId = ctx.getParam<{ mode: string; value: string }>("dataTableId", { mode: "list", value: "" });
    const tableKey = `__datatable__${dataTableId.value}`;
    const stored = ctx.getAllCustomData()[tableKey];

    if (stored) {
      try {
        rows = JSON.parse(stored);
      } catch {
        rows = [];
      }
    }

    const filterRows = ctx.getParam<boolean>("filterRows", false);
    if (filterRows && rows.length > 0) {
      const matchType = ctx.getParam<string>("matchType", "anyCondition");
      const filtersRaw = ctx.getParam<{ conditions?: Array<{ keyName: string; condition: string; keyValue: string }> }>("filters", {});
      const conditions = filtersRaw?.conditions ?? [];

      if (conditions.length > 0) {
        rows = rows.filter((row) => {
          if (matchType === "allConditions") {
            return conditions.every((c) => matchRow(row, c));
          }
          return conditions.some((c) => matchRow(row, c));
        });
      }
    }
  } else if (source === "googleSheets") {
    const stored = ctx.getAllCustomData()["__datatable__googleSheets"];
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.rows) {
          rows = parsed.rows;
        }
      } catch {
        rows = [];
      }
    }
  }

  const limitRows = ctx.getParam<boolean>("limitRows", false);
  if (limitRows) {
    const maxRows = ctx.getParam<number>("maxRows", 10);
    rows = rows.slice(0, Math.max(0, maxRows));
  }

  const items: INodeExecutionData[] = rows.map((row, idx) => ({
    json: row,
    pairedItem: { item: idx },
  }));

  return [items];
};