import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

interface WorkflowInputValue {
  name?: string;
  type?: string;
  value?: unknown;
}

interface WorkflowInputsParam {
  values?: WorkflowInputValue[];
}

interface ToolHandle {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }>;
}

function coerceValue(value: unknown, targetType: string): unknown {
  switch (targetType) {
    case "number": {
      const n = Number(value);
      return isNaN(n) ? value : n;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === 1) return true;
      return false;
    case "array":
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return [value];
        }
      }
      return [value];
    case "object":
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === "object" ? parsed : { value };
        } catch {
          return { value };
        }
      }
      return { value };
    default:
      return String(value);
  }
}

function assembleInputItem(
  workflowInputs: WorkflowInputsParam | undefined,
  firstItemJson: Record<string, unknown>,
): Record<string, unknown> {
  if (!workflowInputs?.values || workflowInputs.values.length === 0) {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const field of workflowInputs.values) {
    if (!field.name) continue;
    const rawValue = field.value;
    let resolved: unknown = rawValue;
    if (typeof rawValue === "string" && (rawValue.startsWith("=") || rawValue.startsWith("{{"))) {
      const evalResult = evaluateExpression(rawValue, { json: firstItemJson });
      if (evalResult.ok) {
        resolved = evalResult.value;
      }
    }
    result[field.name] = field.type ? coerceValue(resolved, field.type) : resolved;
  }
  return result;
}

async function invokeToolWorkflow(
  ctx: Parameters<NodeExecutor>[0],
  args: Record<string, unknown>,
): Promise<{ content: string; isError?: boolean }> {
  const source = ctx.getParam<string>("source", "database");
  const continueOnFail = ctx.continueOnFail();

  let workflowJson: Record<string, unknown> | undefined;
  let workflowId: string | undefined;

  if (source === "parameter") {
    const raw = ctx.getParam<string>("workflowJson", "");
    if (!raw) {
      return { content: "No workflowJson provided", isError: true };
    }
    try {
      workflowJson = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>);
    } catch {
      return { content: "Invalid workflowJson: could not parse", isError: true };
    }
  } else {
    workflowId = ctx.getParam<string>("workflowId", "");
    if (!workflowId) {
      return { content: "No workflowId provided for database source", isError: true };
    }
  }

  const workflowInputs = ctx.getParam<WorkflowInputsParam>("workflowInputs", {});
  const mergedArgs = { ...assembleInputItem(workflowInputs, args), ...args };

  if (!ctx.runSubWorkflow) {
    return { content: "Sub-workflow execution is not available in this context", isError: true };
  }

  try {
    const childItems = await ctx.runSubWorkflow({
      workflowId,
      workflowJson: workflowJson as Parameters<NonNullable<typeof ctx.runSubWorkflow>>[0]["workflowJson"],
      items: [{ json: mergedArgs }],
    });

    const output = childItems.length > 0 ? childItems : [{ json: {} }];
    const content = JSON.stringify(output.map((i) => i.json));

    return { content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (continueOnFail) {
      return { content: `Tool workflow execution failed: ${message}`, isError: true };
    }
    throw err;
  }
}

export const toolWorkflowExecutor: NodeExecutor = async (ctx) => {
  const name = ctx.getParam<string>("name", "");
  const description = ctx.getParam<string>("description", "");

  if (!name) {
    throw new Error("toolWorkflow: `name` parameter is required");
  }

  const handle: ToolHandle = {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Primary natural-language or structured input for the sub-workflow",
        },
        input: {
          type: "string",
          description: "Optional alternate payload string passed through to the sub-workflow",
        },
      },
      additionalProperties: true,
      required: [],
    },
    invoke: (args: Record<string, unknown>) => invokeToolWorkflow(ctx, args),
  };

  const output: INodeExecutionData[] = [{ json: handle as unknown as Record<string, unknown> }];
  return [output];
};
