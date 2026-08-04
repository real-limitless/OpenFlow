import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import {
  getAuthHeaders,
  runProjectOperation,
  runTaskOperation,
  runSubtaskOperation,
  runTaskCommentOperation,
  runTaskTagOperation,
  runTaskProjectOperation,
  runUserOperation,
} from "./asana";

export const asanaToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "Task");
  const operation = String(node.parameters.operation ?? "Create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const auth = await getAuthHeaders(ctx);
      let result: { json: Record<string, unknown> } | { json: Record<string, unknown>[] };
      switch (resource) {
        case "Project":
          result = await runProjectOperation(node, operation, itemJson, auth);
          break;
        case "Task":
          result = await runTaskOperation(node, operation, itemJson, auth);
          break;
        case "Subtask":
          result = await runSubtaskOperation(node, operation, itemJson, auth);
          break;
        case "Task Comment":
          result = await runTaskCommentOperation(node, operation, itemJson, auth);
          break;
        case "Task Tag":
          result = await runTaskTagOperation(node, operation, itemJson, auth);
          break;
        case "Task Project":
          result = await runTaskProjectOperation(node, operation, itemJson, auth);
          break;
        case "User":
          result = await runUserOperation(node, operation, itemJson, auth);
          break;
        default:
          throw new Error(`Asana Tool: unsupported resource "${resource}"`);
      }
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, httpCode: code } }, pairedItem });
    }
  }

  return [out];
};
