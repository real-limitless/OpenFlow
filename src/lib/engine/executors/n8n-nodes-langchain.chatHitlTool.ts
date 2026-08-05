import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import type { IWorkflow, INode } from "@/lib/workflow/types";

interface WaitResumePayload {
  chatInput?: string;
  data?: {
    approved?: boolean;
    responseText?: string;
  };
}

function findChatTrigger(workflow: IWorkflow): INode | undefined {
  return workflow.nodes?.find(
    (n) => n.type === "@n8n/n8n-nodes-langchain.chatTrigger",
  );
}

function throwConfigError(message: string): never {
  throw new Error(message);
}

function validateChatTriggerMode(workflow: IWorkflow): void {
  const trigger = findChatTrigger(workflow);
  if (!trigger) {
    throwConfigError(
      "Chat HITL Tool requires a Chat Trigger node in the workflow with Response Mode set to 'Using Response Nodes'. No Chat Trigger found.",
    );
  }
  const triggerParams = trigger.parameters ?? {};
  const options = triggerParams.options as Record<string, unknown> | undefined;
  const responseMode = options?.responseMode as string | undefined;
  if (responseMode && responseMode !== "responseNodes") {
    throwConfigError(
      `Chat HITL Tool requires the Chat Trigger's Response Mode to be 'Using Response Nodes'. Found: '${responseMode}'.`,
    );
  }
  const embedOptions = triggerParams.embedOptions as Record<string, unknown> | undefined;
  const mode = embedOptions?.mode as string | undefined;
  if (mode === "embedded") {
    throwConfigError(
      "Chat HITL Tool only works with Hosted Chat mode, but the Chat Trigger is in Embedded mode.",
    );
  }
}

function extractWaitResumePayload(node: INode): WaitResumePayload | null {
  const resumedFrom = (node as unknown as Record<string, unknown>).resumedFrom as
    | Record<string, unknown>
    | undefined;
  if (!resumedFrom) return null;
  return resumedFrom as unknown as WaitResumePayload;
}

function renderToolMessage(ctx: ExecutionContext, toolName: string, toolParameters: unknown): string {
  const rawMessage = ctx.getParam<string>(
    "message",
    'The AI wants to use {{ $tool.name }} with params: {{ JSON.stringify($tool.parameters, null, 2) }}',
  );
  const toolParamsStr =
    typeof toolParameters === "string"
      ? toolParameters
      : JSON.stringify(toolParameters, null, 2);
  return rawMessage
    .replace(/\{\{\s*\$tool\.name\s*\}\}/g, toolName)
    .replace(/\{\{\s*JSON\.stringify\(\s*\$tool\.parameters[^}]*\)\s*\}\}/g, toolParamsStr)
    .replace(/\{\{\s*\$tool\.parameters\s*\}\}/g, toolParamsStr)
    .replace(/\$tool\.parameters/g, toolParamsStr)
    .replace(/\$tool\.name/g, toolName);
}

export const n8nNodesLangchainChatHitlToolExecutor: NodeExecutor = async (ctx) => {
  const workflow = ctx.getWorkflow();
  validateChatTriggerMode(workflow);

  const resumePayload = extractWaitResumePayload(ctx.getNode());

  const toolName = (ctx as any).toolName ?? "Unknown Tool";
  const toolParameters = (ctx as any).toolParameters ?? {};

  if (resumePayload) {
    const data = resumePayload.data;
    const chatInput = resumePayload.chatInput;

    if (data) {
      if (data.approved === true) {
        return [[{ json: { approved: true, toolName, toolParameters } }]];
      }
      return [[{ json: { approved: false, rejectionReason: data.responseText ?? "Tool call denied by reviewer" } }]];
    }

    if (chatInput) {
      return [[{ json: { approved: false, rejectionReason: chatInput } }]];
    }

    return [[{ json: { approved: true, toolName, toolParameters } }]];
  }

  const responseType = ctx.getParam<string>("responseType", "approval");
  const renderedMessage = renderToolMessage(ctx, toolName, toolParameters);

  const limitWaitTime = ctx.getParam<Record<string, any>>("limitWaitTime", {});

  const outputPayload: Record<string, unknown> = {
    message: renderedMessage,
    responseType,
    toolName,
    toolParameters,
    status: "pending_approval",
  };

  if (responseType === "approval") {
    const approvalType = ctx.getParam<string>("approvalType", "approveAndDisapprove");
    outputPayload.approvalType = approvalType;
    outputPayload.approveButtonLabel = ctx.getParam<string>("approveButtonLabel", "Approve");
    if (approvalType === "approveAndDisapprove") {
      outputPayload.disapproveButtonLabel = ctx.getParam<string>("disapproveButtonLabel", "Disapprove");
    }
    outputPayload.blockUserInput = ctx.getParam<boolean>("blockUserInput", false);
  }

  if (limitWaitTime && typeof limitWaitTime === "object" && !Array.isArray(limitWaitTime)) {
    const lwt = limitWaitTime as Record<string, unknown>;
    if (lwt.values) {
      outputPayload.limitWaitTime = lwt.values;
    } else if (lwt.limitType) {
      outputPayload.limitWaitTime = lwt;
    }
  }

  const output: INodeExecutionData = { json: outputPayload };
  return [[output]];
};
