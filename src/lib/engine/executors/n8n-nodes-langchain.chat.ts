import type { NodeExecutor, ExecutionContext } from "@/sdk";
import type { IWorkflow, INode } from "@/lib/workflow/types";
import { typesEqual } from "@/lib/nodes/type-ids";
import { withPairedItem } from "@/sdk";

interface WaitResumePayload {
  chatInput?: string;
  data?: {
    approved?: boolean;
    responseText?: string;
  };
}

function findConnectedMemoryNode(
  connections: IWorkflow["connections"],
  nodeName: string,
): string | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (t && t.node === nodeName && t.type === "ai_memory") {
            return sourceName;
          }
        }
      }
    }
  }
  return null;
}

function findChatTrigger(workflow: IWorkflow): INode | undefined {
  return workflow.nodes?.find((n) => typesEqual(n.type, "openflow-node-langchain.chatTrigger"));
}

function throwConfigError(message: string): never {
  throw new Error(message);
}

function validateChatTriggerMode(workflow: IWorkflow): void {
  const trigger = findChatTrigger(workflow);
  if (!trigger) {
    throwConfigError(
      "Chat node requires a Chat Trigger node in the workflow with Response Mode set to 'Using Response Nodes / Hosted Chat'. No Chat Trigger found.",
    );
  }
  const triggerParams = trigger.parameters ?? {};
  const options = triggerParams.options as Record<string, unknown> | undefined;
  const responseMode = options?.responseMode as string | undefined;
  if (responseMode && responseMode !== "responseNodes" && responseMode !== "whenLastNode") {
    throwConfigError(
      `Chat node requires the Chat Trigger's Response Mode to be 'Using Response Nodes' or 'When Last Node Finishes'. Found: '${responseMode}'.`,
    );
  }

  const mode = triggerParams.mode as string | undefined;
  if (mode === "embedded") {
    throwConfigError(
      "Chat node only works with Hosted Chat mode, but the Chat Trigger is in Embedded mode.",
    );
  }
}

function checkToolContext(ctx: ExecutionContext): void {
  const workflow = ctx.getWorkflow();
  const node = ctx.getNode();
  if (
    (workflow as Record<string, unknown>).parentTool !== undefined ||
    (node as Record<string, unknown>).parentToolPath !== undefined
  ) {
    throwConfigError(
      "Chat node does not work when used as a tool of a sub-agent or within a sub-workflow used as a tool.",
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

async function commitToMemory(ctx: ExecutionContext, userMessage: string, assistantMessage: string): Promise<void> {
  const workflow = ctx.getWorkflow();
  const node = ctx.getNode();

  const memorySource = findConnectedMemoryNode(workflow.connections, node.name);
  if (!memorySource) {
    throw new Error("Memory connection is enabled but no connected memory node found on ai_memory port");
  }

  const memoryNode = workflow.nodes?.find((n) => n.name === memorySource);
  if (!memoryNode) {
    throw new Error("Memory node not found in workflow");
  }

  const { getExecutorMap } = await import("@/lib/engine/node-runtime");
  const { createExecutionContext } = await import("@/sdk");
  const memExecutor = getExecutorMap()[memoryNode.type];
  if (!memExecutor) {
    throw new Error(`No executor for memory node type: ${memoryNode.type}`);
  }

  const memCtx = createExecutionContext({
    node: memoryNode,
    workflow,
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail: false,
    getCredential: async () => null,
  });
  const [out] = await memExecutor(memCtx, memoryNode);
  const handle = out?.[0]?.json as Record<string, unknown> | undefined;
  if (!handle || typeof handle.appendTurn !== "function") {
    throw new Error("Connected memory node did not provide a valid memory handle");
  }
  handle.appendTurn(
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantMessage },
  );
}

function handleRuntimeError(ctx: ExecutionContext, error: unknown): Array<{ json: Record<string, unknown> }> {
  if (ctx.continueOnFail()) {
    const items = ctx.getInputItems(0);
    const message = error instanceof Error ? error.message : String(error);
    return items.map((item, idx) =>
      withPairedItem({ json: { ...item.json, error: message } }, idx),
    );
  }
  throw error;
}

export const n8nNodesLangchainChatExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "send");
  const workflow = ctx.getWorkflow();
  const message = ctx.getParam<string>("message", "");

  checkToolContext(ctx);

  if (operation === "send") {
    validateChatTriggerMode(workflow);
    const memoryConnection = ctx.getParam<boolean>("memoryConnection", false);
    if (memoryConnection && message) {
      const inputItems = ctx.getInputItems(0);
      const userMessage = inputItems[0]?.json?.chatInput ?? inputItems[0]?.json?.userMessage ?? "";
      try {
        await commitToMemory(ctx, userMessage, message);
      } catch (e) {
        return [handleRuntimeError(ctx, e)];
      }
    }
    return [items.map((item, idx) => withPairedItem(item, idx))];
  }

  if (operation === "sendAndWait") {
    validateChatTriggerMode(workflow);

    const responseType = ctx.getParam<string>("responseType", "freeText");
    const resumePayload = extractWaitResumePayload(ctx.getNode());

    const memoryConnection = ctx.getParam<boolean>("memoryConnection", false);
    if (memoryConnection && message && resumePayload) {
      const inputItems = ctx.getInputItems(0);
      const userMessage = resumePayload.chatInput ?? inputItems[0]?.json?.userMessage ?? "";
      try {
        await commitToMemory(ctx, userMessage, message);
      } catch (e) {
        return [handleRuntimeError(ctx, e)];
      }
    }

    if (!resumePayload) {
      throwConfigError("sendAndWait: waiting for user response");
    }

    if (responseType === "freeText") {
      return [[{ json: { chatInput: resumePayload!.chatInput ?? "" } }]];
    }

    if (responseType === "approval") {
      const blockUserInput = ctx.getParam<boolean>("blockUserInput", false);

      if (resumePayload!.data) {
        return [[{ json: { data: resumePayload!.data } }]];
      }

      if (!blockUserInput && resumePayload!.chatInput) {
        return [[{ json: { data: { approved: false, responseText: resumePayload!.chatInput } } }]];
      }

      return [[{ json: { data: { approved: true } } }]];
    }
  }

  return [items.map((item, idx) => withPairedItem(item, idx))];
};
