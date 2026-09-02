import { useEffect, useRef, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatThreadMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

export function ChatThread({
  messages,
  pending,
  disabled,
  placeholder,
  emptyHint,
  onSend,
}: {
  messages: ChatThreadMessage[];
  pending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyHint?: string;
  onSend: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text || pending || disabled) return;
    el.value = "";
    onSend(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !pending && (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {emptyHint ?? "Type a message to start this workflow."}
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[92%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug",
              m.role === "user" && "ml-auto bg-primary text-primary-foreground",
              m.role === "assistant" && "bg-muted text-foreground",
              m.role === "system" && "mx-auto bg-transparent text-center text-[11px] text-muted-foreground",
            )}
          >
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
          </div>
        ))}
        {pending && (
          <div className="w-fit rounded-lg bg-muted px-2.5 py-1.5 text-[12px] text-muted-foreground">
            Running…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex shrink-0 items-end gap-1.5 border-t border-border p-2">
        <textarea
          ref={inputRef}
          rows={2}
          disabled={disabled || pending}
          placeholder={placeholder ?? "Message"}
          className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button type="submit" size="icon" className="size-8 shrink-0" disabled={disabled || pending}>
          <Send className="size-3.5" />
        </Button>
      </form>
    </div>
  );
}
