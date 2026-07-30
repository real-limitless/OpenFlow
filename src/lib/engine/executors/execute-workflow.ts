import type { NodeExecutor, INodeExecutionData, IWorkflow } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function parseWorkflowJson(raw: unknown): IWorkflow | undefined {
  if (!raw) return undefined;
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as IWorkflow).nodes)) {
    return raw as IWorkflow;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as IWorkflow;
      if (parsed && Array.isArray(parsed.nodes)) return parsed;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Normalize workflowId from string, number, or resource-locator object. */
export function coerceWorkflowId(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string" || typeof raw === "number") return String(raw).trim();
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (o.value != null) return String(o.value).trim();
    if (o.id != null) return String(o.id).trim();
    if (o.workflowId != null) return String(o.workflowId).trim();
  }
  return String(raw).trim();
}

interface WorkflowInputField {
  name?: string;
  type?: string;
}

interface WorkflowInputsParam {
  mappingMode?: string;
  /** Child input schema; when present, unmapped fields are null-filled. */
  schema?: WorkflowInputField[];
  /** Per-field mappings: { fieldName: { value: expressionOrLiteral } }. */
  value?: Record<string, { value?: unknown; [k: string]: unknown }>;
}

/**
 * Map parent items onto the child's declared input schema via `workflowInputs`.
 * - Evaluates each field's `value` expression against the source item.
 * - Unmapped child schema fields (from `schema`) receive `null`.
 * - When no schema is available, only the mapped fields are emitted.
 */
function applyWorkflowInputs(
  items: INodeExecutionData[],
  workflowInputs: WorkflowInputsParam | undefined,
): INodeExecutionData[] {
  if (!workflowInputs || workflowInputs.mappingMode !== "defineBelow") return items;
  const value = workflowInputs.value ?? {};
  const schemaFields = workflowInputs.schema ?? [];

  return items.map((item, idx) => {
    const json: Record<string, unknown> = {};
    // Null-fill every declared child field first; mapped values overwrite.
    for (const field of schemaFields) {
      if (field.name) json[field.name] = null;
    }
    for (const [fieldName, entry] of Object.entries(value)) {
      const rawValue = entry?.value;
      if (typeof rawValue === "string") {
        const result = evaluateExpression(rawValue, {
          json: item.json,
          itemIndex: idx,
        });
        json[fieldName] = result.ok ? result.value : rawValue;
      } else {
        json[fieldName] = rawValue;
      }
    }
    return { json, pairedItem: item.pairedItem ?? { item: idx, input: 0 } };
  });
}

export const executeWorkflowExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] = inputItems.length > 0 ? inputItems : [{ json: {} }];

  const source = ctx.getParam<string>("source", "database");
  const workflowId = coerceWorkflowId(
    ctx.getParam("workflowId") ?? ctx.getParam("workflow") ?? ctx.getParam("id"),
  );
  const mode = ctx.getParam<string>("mode", "once");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  // v1.2+ uses waitForSubWorkflow; accept waitForCompletion as a legacy alias.
  const waitForSubWorkflow =
    options.waitForSubWorkflow !== undefined
      ? options.waitForSubWorkflow !== false
      : options.waitForCompletion !== false;

  const workflowJson = parseWorkflowJson(
    ctx.getParam("workflowJson") ?? ctx.getParam("workflowData"),
  );

  const workflowInputs = ctx.getParam<WorkflowInputsParam>("workflowInputs");
  const mappedItems = applyWorkflowInputs(items, workflowInputs);

  // Non-wait (fire-and-forget): return the input items without awaiting child
  // terminal output. The child run is still started when a runner is available,
  // but the parent does not block on its terminal items.
  if (!waitForSubWorkflow) {
    if (ctx.runSubWorkflow) {
      const batch = mode === "each" ? mappedItems.map((i) => [i]) : [mappedItems];
      for (const batchItems of batch) {
        void ctx.runSubWorkflow({
          workflowId: workflowId || undefined,
          workflowJson: source === "parameter" ? workflowJson : undefined,
          items: batchItems,
        });
      }
    }
    return [items];
  }

  if (!ctx.runSubWorkflow) {
    throw new Error(
      "Sub-workflow execution is not available in this runtime context (no runSubWorkflow).",
    );
  }

  const childWorkflowJson = source === "parameter" ? workflowJson : undefined;

  if (mode === "each") {
    const out: INodeExecutionData[] = [];
    for (const item of mappedItems) {
      const childItems = await ctx.runSubWorkflow({
        workflowId: workflowId || undefined,
        workflowJson: childWorkflowJson,
        items: [item],
      });
      out.push(...(childItems.length > 0 ? childItems : [{ json: {} }]));
    }
    return [out];
  }

  // once — all items in a single sub-run
  const childItems = await ctx.runSubWorkflow({
    workflowId: workflowId || undefined,
    workflowJson: childWorkflowJson,
    items: mappedItems,
  });

  return [childItems.length > 0 ? childItems : [{ json: {} }]];
};