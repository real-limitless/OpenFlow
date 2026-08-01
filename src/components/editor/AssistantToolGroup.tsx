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

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 w-full max-w-full">
      <div
        className={cn(
          "min-w-0 w-full max-w-full overflow-hidden rounded-md border bg-background/50",
          hasError ? "border-destructive/40" : "border-border/70",
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/40"
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
        <CollapsibleContent className="min-w-0 max-w-full overflow-hidden">
          <ul className="min-w-0 space-y-1.5 border-t border-border/50 px-2 py-2">
            {tools.map((t) => (
              <li
                key={t.id}
                className="min-w-0 max-w-full overflow-hidden rounded border border-border/50 bg-background/60 px-2 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-1.5">
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
                  <pre
                    className={cn(
                      "mt-1 max-h-32 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-all",
                      "rounded bg-muted/40 p-1.5 font-mono text-[10px] leading-snug text-muted-foreground",
                    )}
                  >
                    {formatValue(t.args)}
                  </pre>
                )}
                {t.result != null && (
                  <pre
                    className={cn(
                      "mt-1 max-h-32 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-all",
                      "rounded bg-muted/40 p-1.5 font-mono text-[10px] leading-snug",
                      t.status === "error" ? "text-destructive/90" : "text-muted-foreground/90",
                    )}
                  >
                    → {formatValue(t.result)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
