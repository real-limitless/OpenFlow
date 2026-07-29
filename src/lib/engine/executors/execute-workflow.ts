import type { NodeExecutor, INodeExecutionData, IWorkflow } from "@/sdk";

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

export const executeWorkflowExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] = inputItems.length > 0 ? inputItems : [{ json: {} }];

  const source = ctx.getParam<string>("source", "database");
  const workflowId = coerceWorkflowId(
    ctx.getParam("workflowId") ?? ctx.getParam("workflow") ?? ctx.getParam("id"),
  );
  const mode = ctx.getParam<string>("mode", "once");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const waitForCompletion = options.waitForCompletion !== false;

  const workflowJson = parseWorkflowJson(
    ctx.getParam("workflowJson") ?? ctx.getParam("workflowData"),
  );

  if (!ctx.runSubWorkflow) {
    throw new Error(
      "Sub-workflow execution is not available in this runtime context (no runSubWorkflow).",
    );
  }

  if (!waitForCompletion) {
    // Fire-and-forget: still run synchronously in OpenFlow v1 but return input immediately shape
    // after starting would need a job queue; for now run and return child output when complete.
  }

  if (mode === "each") {
    const out: INodeExecutionData[] = [];
    for (const item of items) {
      const childItems = await ctx.runSubWorkflow({
        workflowId: workflowId || undefined,
        workflowJson: source === "parameter" || source === "list" ? workflowJson : workflowJson,
        items: [item],
      });
      out.push(...(childItems.length > 0 ? childItems : [{ json: {} }]));
    }
    return [out];
  }

  // once — all items in one sub-run
  const idOrName = workflowId || undefined;
  const childItems = await ctx.runSubWorkflow({
    workflowId: idOrName,
    workflowJson:
      source === "parameter" || workflowJson
        ? workflowJson
        : undefined,
    items,
  });

  return [childItems.length > 0 ? childItems : [{ json: {} }]];
};
