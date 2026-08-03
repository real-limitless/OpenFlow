import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import { createExecutionContext } from "@/sdk";
import { postgresExecutor } from "./postgres";

export const postgresToolExecutor: NodeExecutor = async (ctx, _node) => {
  const remappedNode = {
    ..._node,
    parameters: remapParams(_node.parameters),
  };

  const remappedCtx: ExecutionContext = createExecutionContext({
    node: remappedNode,
    workflow: ctx.getWorkflow(),
    getNodeInputItems: (name, index) => ctx.getNodeInputItems(name, index),
    continueOnFail: ctx.continueOnFail(),
    getCredential: async (name) => ctx.getCredential(name),
    nodeData: undefined,
    dataTables: ctx.dataTables,
    vars: ctx.vars,
  });

  return postgresExecutor(remappedCtx, remappedNode);
};

function remapParams(params: Record<string, unknown>): Record<string, unknown> {
  const p = { ...params };
  const options = (p.options as Record<string, unknown>) ?? {};

  if (p.mappingMode !== undefined) {
    p.dataMode = p.mappingMode;
  }

  if (p.updateKey !== undefined) {
    p.columnToMatchOn = p.updateKey;
    p.valueToMatchOn = "";
  }

  const columns = p.columns;
  if (columns && typeof columns === "object" && !Array.isArray(columns)) {
    const colObj = columns as Record<string, unknown>;
    const vals = colObj.values;
    if (Array.isArray(vals)) {
      p.valuesToSend = { values: vals as Array<Record<string, unknown>> };
    }
  }

  if (options.queryParameters !== undefined) {
    const fieldNames = String(options.queryParameters).split(",").map((s) => s.trim()).filter(Boolean);
    if (fieldNames.length > 0) {
      options.queryReplacement = `={{ [${fieldNames.map((f) => `$json.${f}`).join(", ")}] }}`;
    }
    delete options.queryParameters;
  }

  if (typeof options.outputColumns === "string" && options.outputColumns) {
    options.outputColumns = options.outputColumns.split(",").map((s: string) => s.trim());
  }

  p.options = options;
  return p;
}
