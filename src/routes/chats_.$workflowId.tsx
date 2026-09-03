import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { ChatThread, type ChatThreadMessage } from "@/components/chat/ChatThread";
import { fetchChatHubAgents, sendChatHubMessage, type ChatHubAgent } from "@/lib/chat/hub-client";

export const Route = createFileRoute("/chats_/$workflowId")({
  head: () => ({ meta: [{ title: "Chat — OpenFlow" }] }),
  component: ChatHubConversationPage,
});

function sessionKey(workflowId: string) {
  return `openflow.chat.hub.session:${workflowId}`;
}

function ensureSessionId(workflowId: string): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const existing = window.sessionStorage.getItem(sessionKey(workflowId));
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(sessionKey(workflowId), next);
  return next;
}

function ChatHubConversationPage() {
  const { workflowId } = Route.useParams();
  const [agent, setAgent] = useState<ChatHubAgent | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [pending, setPending] = useState(false);
  const sessionId = useMemo(() => ensureSessionId(workflowId), [workflowId]);

  useEffect(() => {
    void fetchChatHubAgents().then((list) => {
      setAgent(list.find((a) => a.workflowId === workflowId) ?? null);
    });
  }, [workflowId]);

  const send = useCallback(
    async (text: string) => {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
      setPending(true);
      try {
        const res = await sendChatHubMessage(workflowId, {
          chatInput: text,
          sessionId,
          action: "sendMessage",
        });
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: res.output.trim() ? res.output : "(empty response)",
          },
        ]);
      } catch (err) {
        toast.error("Chat failed", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setPending(false);
      }
    },
    [sessionId, workflowId],
  );

  return (
    <PageShell maxWidth="max-w-3xl">
      <Link
        to="/chats"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All chats
      </Link>
      <div className="mt-4 flex items-center gap-2">
        <MessageCircle className="size-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">
          {agent === undefined ? "Loading…" : agent?.name ?? "Chat agent"}
        </h1>
      </div>
      {agent?.description ? (
        <p className="mt-1 text-[13px] text-muted-foreground">{agent.description}</p>
      ) : null}
      {agent === null ? (
        <p className="mt-6 text-sm text-muted-foreground">
          This agent is not available. Enable Make Available in OpenFlow Chat and activate the
          workflow.
        </p>
      ) : (
        <div className="mt-6 h-[min(36rem,70vh)] overflow-hidden rounded-lg border border-border bg-card">
          <ChatThread
            messages={messages}
            pending={pending}
            disabled={agent === undefined}
            emptyHint="Send a message to start this workflow."
            onSend={(t) => void send(t)}
          />
        </div>
      )}
    </PageShell>
  );
}
