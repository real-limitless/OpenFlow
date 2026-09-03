import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { fetchChatHubAgents, type ChatHubAgent } from "@/lib/chat/hub-client";

export const Route = createFileRoute("/chats")({
  head: () => ({ meta: [{ title: "Chat — OpenFlow" }] }),
  component: ChatHubPage,
});

function ChatHubPage() {
  const [agents, setAgents] = useState<ChatHubAgent[] | null>(null);

  const refresh = useCallback(async () => {
    setAgents(await fetchChatHubAgents());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PageShell>
      <div className="flex items-center gap-2 text-primary">
        <MessageCircle className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Chat</h1>
      </div>
      <p className="mt-2 text-[14px] text-muted-foreground">
        Agents from workflows with Chat Trigger and “Make Available in OpenFlow Chat” enabled.
        Activate the workflow to list it here.
      </p>

      {agents === null ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No chat agents yet. Add a Chat Trigger, turn on Make Available in OpenFlow Chat, and
          activate the workflow.
        </p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {agents.map((a) => (
            <li key={`${a.workflowId}:${a.nodeId}`}>
              <Link
                to="/chats/$workflowId"
                params={{ workflowId: a.workflowId }}
                className="block rounded-lg border border-border bg-card p-4 hover:bg-accent/40"
              >
                <p className="text-[15px] font-medium text-foreground">{a.name}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{a.workflowName}</p>
                {a.description ? (
                  <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{a.description}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
