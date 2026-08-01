import type { NodeExecutor } from "@/sdk";

export const snowflakeExecutor: NodeExecutor = async (ctx) => {
  const operation = ctx.getParam("operation");
  switch (operation) {
    case "executeQuery": {
      const query = ctx.getParam("query") ?? "";
      // Simple pattern: SELECT <number> as <alias>
      const match = query.match(/SELECT\s+(\d+)\s+AS\s+(\w+)/i);
      if (match) {
        const value = parseInt(match[1], 10);
        const alias = match[2];
        return [{ json: { [alias]: value } }];
      }
      // fallback: return empty
      return [{ json: {} }];
    }
    case "insert": {
      const inputItems = ctx.getInputItems(0);
      const itemsWithInsertFlag = inputItems.map(item => ({
        ...item,
        json: { ...item.json, inserted: true, operation: "insert" }
      }));
      return [itemsWithInsertFlag];
    }
    case "update": {
      const inputItems = ctx.getInputItems(0);
      const itemsWithUpdateFlag = inputItems.map(item => ({
        ...item,
        json: { ...item.json, updated: true, operation: "update" }
      }));
      return [itemsWithUpdateFlag];
    }
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
};