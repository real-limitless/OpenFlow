import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Wrench, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type ToolStep = {
  id: string;
  name: string;
  args?: unknown;
  result?: unknown;
  status: "running" | "ok" | "error";
};

function trunc(value: unknown, max = 220): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function summaryNames(tools: ToolStep[], max = 3): string {
  const names = tools.map((t) => t.name);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

export function AssistantToolGroup({ tools }: { tools: ToolStep[] }) {
  const [open, setOpen] = useState(false);
  const running = tools.some((t) => t.status === "running");
  const hasError = tools.some((t) => t.status === "error");
  const count = tools.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-md border bg-background/50",
          hasError ? "border-destructive/40" : "border-border/70",
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/40"
          >
            {open ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            )}
            {running ? (
              <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
            ) : (
              <Wrench
                className={cn(
                  "size-3 shrink-0",
                  hasError ? "text-destructive" : "text-muted-foreground",
                )}
              />
            )}
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-foreground/80">
                Used {count} tool{count === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground"> · {summaryNames(tools)}</span>
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="space-y-1.5 border-t border-border/50 px-2 py-2">
            {tools.map((t) => (
              <li
                key={t.id}
                className="rounded border border-border/50 bg-background/60 px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  {t.status === "running" ? (
                    <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
                  ) : t.status === "error" ? (
                    <X className="size-3 shrink-0 text-destructive" />
                  ) : (
                    <Check className="size-3 shrink-0 text-emerald-500" />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-mono text-[11px]",
                      t.status === "error" && "text-destructive",
                    )}
                  >
                    {t.name}
                  </span>
                </div>
                {t.args != null && (
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    {trunc(t.args)}
                  </p>
                )}
                {t.result != null && (
                  <p
                    className={cn(
                      "mt-0.5 truncate font-mono text-[10px]",
                      t.status === "error" ? "text-destructive/90" : "text-muted-foreground/90",
                    )}
                  >
                    → {trunc(t.result)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
