import { useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ChatThread, type ChatThreadMessage } from "@/components/chat/ChatThread";
import { isAnyChatTriggerNode, isChatTriggerNode } from "@/lib/chat/path";
import { extractChatWorkflowResponse } from "@/lib/chat/response";
import type { ExecutionRunData } from "@/lib/engine/types";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";

function sessionStorageKey(workflowId: string) {
  return `openflow.chat.session:${workflowId}`;
}

function ensureSessionId(workflowId: string): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const existing = window.sessionStorage.getItem(sessionStorageKey(workflowId));
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(sessionStorageKey(workflowId), next);
  return next;
}

export function WorkflowChatPanel({
  workflowId,
  isExecuting,
  onExecute,
}: {
  workflowId: string;
  isExecuting: boolean;
  onExecute?: (
    startNode?: string,
    opts?: { pinData?: Record<string, INodeExecutionData[]> },
  ) => Promise<ExecutionRunData | null | void>;
}) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const trigger = useMemo(
    () => workflow.nodes.find((n) => !n.disabled && isAnyChatTriggerNode(n)),
    [workflow.nodes],
  );
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [pending, setPending] = useState(false);

  const send = async (text: string) => {
    if (!trigger || !onExecute) return;
    const useSession = isChatTriggerNode(trigger);
    const sessionId = useSession ? ensureSessionId(workflow.id || workflowId) : undefined;
    const userMsg: ChatThreadMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setPending(true);
    try {
      const json: Record<string, unknown> = {
        chatInput: text,
        action: "sendMessage",
      };
      if (sessionId) json.sessionId = sessionId;
      const runData = await onExecute(trigger.name, {
        pinData: { [trigger.name]: [{ json }] },
      });
      if (!runData) {
        toast.error("Chat run did not return data");
        return;
      }
      const options = (trigger.parameters?.options ?? {}) as { responseMode?: string };
      const reply = extractChatWorkflowResponse(
        workflow,
        runData,
        options.responseMode ?? "whenLastNode",
      );
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: reply.trim() ? reply : "(empty response)",
        },
      ]);
    } catch (err) {
      toast.error("Chat execution failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPending(false);
    }
  };

  if (!trigger) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <MessageCircle className="size-6 text-muted-foreground" />
        <p className="text-[13px] font-medium">No chat trigger</p>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Add a Chat Trigger or Manual Chat Trigger and connect it to an Agent or Chain, then send
          a message here to start the workflow.
        </p>
      </div>
    );
  }

  return (
    <ChatThread
      messages={messages}
      pending={pending || isExecuting}
      placeholder="Type a message to run this workflow"
      emptyHint={`Send a message to start from “${trigger.name}”.`}
      onSend={(t) => void send(t)}
    />
  );
}
