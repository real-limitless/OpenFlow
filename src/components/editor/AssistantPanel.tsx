import { useCallback, useEffect, useRef, useState } from "react";
import {
  History,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useWorkflowStore } from "@/store/workflow-store";
import type { IWorkflow } from "@/lib/workflow/types";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { AssistantToolGroup, type ToolStep } from "./AssistantToolGroup";

type ChatItem =
  | { kind: "user"; id: string; content: string }
  | { kind: "assistant"; id: string; content: string }
  | { kind: "tool_group"; id: string; tools: ToolStep[] }
  | { kind: "error"; id: string; content: string };

type Health = { enabled: boolean; backend: string; llmConfigured: boolean };

const SUGGESTIONS = [
  "Add a Manual Trigger and an HTTP Request node, then connect them",
  "Show me what nodes are on this workflow",
  "Run this workflow and summarize the result",
];

function hydrateItems(
  messages: Array<{ id: string; role: string; content: string; toolName?: string }>,
): ChatItem[] {
  const out: ChatItem[] = [];
  let pendingTools: ToolStep[] = [];
  let toolGroupId = "";

  const flushTools = () => {
    if (pendingTools.length === 0) return;
    out.push({ kind: "tool_group", id: toolGroupId || `tg_${out.length}`, tools: pendingTools });
    pendingTools = [];
    toolGroupId = "";
  };

  for (const m of messages) {
    if (m.role === "tool") {
      if (pendingTools.length === 0) toolGroupId = `tg_${m.id}`;
      let args: unknown;
      try {
        args = JSON.parse(m.content);
      } catch {
        args = m.content;
      }
      pendingTools.push({
        id: m.id,
        name: m.toolName ?? "tool",
        args,
        status: "ok",
      });
      continue;
    }
    flushTools();
    if (m.role === "user") {
      out.push({ kind: "user", id: m.id, content: m.content });
    } else if (m.role === "assistant") {
      out.push({ kind: "assistant", id: m.id, content: m.content });
    }
  }
  flushTools();
  return out;
}

function patchToolGroup(items: ChatItem[], updater: (tools: ToolStep[]) => ToolStep[]): ChatItem[] {
  const next = [...items];
  const last = next[next.length - 1];
  if (last?.kind === "tool_group") {
    next[next.length - 1] = { ...last, tools: updater(last.tools) };
    return next;
  }
  const tools = updater([]);
  if (tools.length === 0) return items;
  return [...next, { kind: "tool_group", id: `tg_${Date.now()}`, tools }];
}

export function AssistantPanel({ workflowId }: { workflowId: string }) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const persist = useWorkflowStore((s) => s.persist);
  const dirty = useWorkflowStore((s) => s.dirty);
  const applyRemote = useWorkflowStore((s) => s.applyRemote);

  useEffect(() => {
    void fetch("/api/v1/assistant/health")
      .then((r) => r.json())
      .then((h: Health) => setHealth(h))
      .catch(() => setHealth({ enabled: false, backend: "builtin", llmConfigured: false }));
  }, []);

  const reloadSession = useCallback(async () => {
    const data = await fetch(`/api/v1/workflows/${workflowId}/assistant/session`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (data?.messages?.length) {
      setItems(hydrateItems(data.messages));
    } else {
      setItems([]);
    }
  }, [workflowId]);

  useEffect(() => {
    void reloadSession();
  }, [reloadSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, busy]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const clear = useCallback(async () => {
    stop();
    await fetch(`/api/v1/workflows/${workflowId}/assistant/session`, { method: "DELETE" });
    setItems([]);
    setEditingId(null);
  }, [stop, workflowId]);

  const rollbackTo = useCallback(
    async (messageId: string, opts?: { keepMessage?: boolean }) => {
      stop();
      const res = await fetch(`/api/v1/workflows/${workflowId}/assistant/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          keepMessage: opts?.keepMessage !== false,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `Rollback failed (${res.status})`);
      }
      const data = (await res.json()) as {
        messages?: Array<{ id: string; role: string; content: string; toolName?: string }>;
        workflow?: IWorkflow | null;
        restored?: boolean;
      };
      if (data.workflow) {
        applyRemote(data.workflow);
      }
      if (data.messages) {
        setItems(hydrateItems(data.messages));
      } else {
        await reloadSession();
      }
      return data;
    },
    [workflowId, stop, applyRemote, reloadSession],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setInput("");
      setEditingId(null);
      const userId = `u_${Date.now()}`;
      setItems((prev) => [...prev, { kind: "user", id: userId, content: message }]);
      setBusy(true);

      const ac = new AbortController();
      abortRef.current = ac;
      const assistantId = `a_${Date.now()}`;
      let assistantStarted = false;

      try {
        if (dirty) {
          try {
            await persist();
          } catch (err) {
            throw new Error(
              err instanceof Error
                ? `Could not save workflow before chat: ${err.message}`
                : "Could not save workflow before chat",
            );
          }
        }

        const latest = useWorkflowStore.getState().workflow;
        const res = await fetch(`/api/v1/workflows/${workflowId}/assistant/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, workflow: latest }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.text();
          throw new Error(err || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            let ev: {
              type?: string;
              text?: string;
              message?: string;
              name?: string;
              args?: unknown;
              result?: unknown;
              isError?: boolean;
            };
            try {
              ev = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (ev.type === "text" && ev.text) {
              if (!assistantStarted) {
                assistantStarted = true;
                setItems((prev) => [
                  ...prev,
                  { kind: "assistant", id: assistantId, content: ev.text! },
                ]);
              } else {
                setItems((prev) =>
                  prev.map((it) =>
                    it.id === assistantId && it.kind === "assistant"
                      ? { ...it, content: it.content + ev.text }
                      : it,
                  ),
                );
              }
            } else if (ev.type === "tool_call" && ev.name) {
              const stepId = `t_${Date.now()}_${ev.name}_${Math.random().toString(36).slice(2, 6)}`;
              setItems((prev) =>
                patchToolGroup(prev, (tools) => [
                  ...tools,
                  {
                    id: stepId,
                    name: ev.name!,
                    args: ev.args,
                    status: "running",
                  },
                ]),
              );
            } else if (ev.type === "tool_result" && ev.name) {
              setItems((prev) =>
                patchToolGroup(prev, (tools) => {
                  const next = [...tools];
                  let idx = -1;
                  for (let i = next.length - 1; i >= 0; i--) {
                    if (next[i].name === ev.name && next[i].status === "running") {
                      idx = i;
                      break;
                    }
                  }
                  if (idx === -1) {
                    for (let i = next.length - 1; i >= 0; i--) {
                      if (next[i].status === "running") {
                        idx = i;
                        break;
                      }
                    }
                  }
                  if (idx >= 0) {
                    next[idx] = {
                      ...next[idx],
                      result: ev.result,
                      status: ev.isError ? "error" : "ok",
                    };
                  } else {
                    next.push({
                      id: `tr_${Date.now()}_${ev.name}`,
                      name: ev.name!,
                      result: ev.result,
                      status: ev.isError ? "error" : "ok",
                    });
                  }
                  return next;
                }),
              );
            } else if (ev.type === "error") {
              setItems((prev) => [
                ...prev,
                {
                  kind: "error",
                  id: `e_${Date.now()}`,
                  content: ev.message ?? "Assistant error",
                },
              ]);
            } else if (ev.type === "done" && ev.message && !assistantStarted) {
              setItems((prev) => [
                ...prev,
                { kind: "assistant", id: assistantId, content: ev.message! },
              ]);
              assistantStarted = true;
            }
          }
        }
        // Align client ids with server session after stream
        await reloadSession();
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setItems((prev) => [
            ...prev,
            {
              kind: "error",
              id: `e_${Date.now()}`,
              content: e instanceof Error ? e.message : String(e),
            },
          ]);
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, workflowId, dirty, persist, reloadSession],
  );

  const resend = useCallback(
    async (messageId: string, content: string) => {
      if (busy) return;
      try {
        // Drop this message and everything after; restore graph to pre-turn snapshot
        await rollbackTo(messageId, { keepMessage: false });
        await send(content);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Resend failed");
      }
    },
    [busy, rollbackTo, send],
  );

  const restoreHere = useCallback(
    async (messageId: string) => {
      if (busy) return;
      try {
        await rollbackTo(messageId, { keepMessage: true });
        toast.success("Restored workflow and chat to this point");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [busy, rollbackTo],
  );

  const hasRunningTools = items.some(
    (it) => it.kind === "tool_group" && it.tools.some((t) => t.status === "running"),
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden bg-sidebar">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div>
          <p className="text-[13px] font-medium">Assistant</p>
          <p className="text-[10px] text-muted-foreground">
            {health
              ? health.enabled
                ? `${health.backend}${health.llmConfigured || health.backend === "opencode" ? "" : " · no API key"}`
                : "disabled"
              : "…"}
          </p>
        </div>
        <div className="flex gap-1">
          {busy && (
            <Button size="icon" variant="ghost" className="size-7" onClick={stop} title="Stop">
              <Square className="size-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => void clear()}
            title="Clear chat"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="flex min-w-0 max-w-full flex-col gap-2.5 overflow-x-hidden p-3">
          {items.length === 0 && (
            <div className="space-y-2">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Build and run this workflow with natural language. The assistant uses OpenFlow tools
                to edit the canvas. Use Restore on a message to undo later agent changes.
              </p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="block w-full rounded-md border border-border bg-background px-2.5 py-2 text-left text-[12px] text-foreground hover:bg-muted/60"
                  onClick={() => void send(s)}
                  disabled={busy}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {items.map((it) => {
            if (it.kind === "user") {
              const isEditing = editingId === it.id;
              return (
                <div key={it.id} className="group ml-4 min-w-0 max-w-full space-y-1">
                  {isEditing ? (
                    <div className="min-w-0 space-y-1.5 rounded-lg border border-border bg-background p-2">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="min-h-[56px] text-[12px]"
                        autoFocus
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px]"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-[11px]"
                          disabled={busy || !editDraft.trim()}
                          onClick={() => {
                            const text = editDraft.trim();
                            setEditingId(null);
                            void resend(it.id, text);
                          }}
                        >
                          Save &amp; resend
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 max-w-full break-words rounded-lg bg-primary px-2.5 py-2 text-[12px] text-primary-foreground">
                        {it.content}
                      </div>
                      <div className="flex flex-wrap justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
                          disabled={busy}
                          title="Edit and resend from here"
                          onClick={() => {
                            setEditingId(it.id);
                            setEditDraft(it.content);
                          }}
                        >
                          <Pencil className="size-3" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
                          disabled={busy}
                          title="Resend this message (restores graph first)"
                          onClick={() => void resend(it.id, it.content)}
                        >
                          <RefreshCw className="size-3" />
                          Resend
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
                          disabled={busy}
                          title="Undo everything after this message (chat + canvas)"
                          onClick={() => void restoreHere(it.id)}
                        >
                          <History className="size-3" />
                          Restore
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            }
            if (it.kind === "assistant") {
              return (
                <div
                  key={it.id}
                  className="mr-3 min-w-0 max-w-full break-words rounded-lg border border-border bg-background px-2.5 py-2"
                >
                  <AssistantMarkdown content={it.content} />
                </div>
              );
            }
            if (it.kind === "tool_group") {
              return <AssistantToolGroup key={it.id} tools={it.tools} />;
            }
            return (
              <div
                key={it.id}
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[12px] text-destructive"
              >
                {it.content}
              </div>
            );
          })}
          {busy && !hasRunningTools && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Working…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-2">
        <div className="flex gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask to add nodes, wire them, run…"
            className="min-h-[64px] resize-none text-[12px]"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <Button
            size="icon"
            className="size-9 shrink-0"
            disabled={busy || !input.trim()}
            onClick={() => void send(input)}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
