import type { ExecutionRunData } from "./types";
import type { INodeExecutionData, IWorkflow } from "../workflow/types";

export type ErrorWorkflowPayload = {
  execution: {
    id: string;
    url?: string;
    error: { message: string };
    lastNodeExecuted: string;
    mode: string;
    retryOf?: string;
  };
  workflow: { id: string; name: string };
};

export function failedNodeName(runData: ExecutionRunData | Record<string, { status?: string }>): string {
  const entry = Object.entries(runData).find(([, v]) => v?.status === "error");
  return entry?.[0] ?? "";
}

export function buildErrorWorkflowPayload(opts: {
  executionId: string;
  mode: string;
  workflowId: string;
  workflowName: string;
  lastNodeExecuted: string;
  message: string;
  retryOf?: string;
  publicUrl?: string;
}): ErrorWorkflowPayload {
  const payload: ErrorWorkflowPayload = {
    execution: {
      id: opts.executionId,
      error: { message: opts.message },
      lastNodeExecuted: opts.lastNodeExecuted,
      mode: opts.mode,
    },
    workflow: { id: opts.workflowId, name: opts.workflowName },
  };
  if (opts.publicUrl) {
    payload.execution.url = `${opts.publicUrl.replace(/\/$/, "")}/executions/${opts.executionId}`;
  }
  if (opts.retryOf) payload.execution.retryOf = opts.retryOf;
  return payload;
}

export function inputItemsForNode(
  workflow: IWorkflow,
  runData: ExecutionRunData,
  nodeName: string,
): INodeExecutionData[] {
  const incoming = workflow.connections ?? {};
  const items: INodeExecutionData[] = [];
  for (const [source, channels] of Object.entries(incoming)) {
    const mains = channels?.main ?? [];
    for (const branch of mains) {
      for (const link of branch ?? []) {
        if (link?.node !== nodeName) continue;
        const src = runData[source];
        if (src?.status === "success" && src.items?.[0]) {
          items.push(...src.items[0]);
        }
      }
    }
  }
  return items.length > 0 ? items : [{ json: {} }];
}

export function isErrorTriggerType(type: string): boolean {
  return (
    type === "openflow-node-base.errorTrigger" ||
    type === "n8n-nodes-base.errorTrigger" ||
    type.endsWith(".errorTrigger")
  );
}
