import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ExecutionEntry } from "./types";

export function ExecutionEntryDetail({ entry }: { entry: ExecutionEntry }) {
  return (
    <div className="space-y-2 border-t border-border/50 px-2.5 py-2">
      {entry.status === "error" && entry.error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-medium text-destructive">Error</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/15"
              onClick={() => {
                void navigator.clipboard
                  .writeText(
                    JSON.stringify(
                      {
                        node: entry.name,
                        status: entry.status,
                        error: entry.error,
                        startedAt: entry.startedAt,
                        finishedAt: entry.finishedAt,
                      },
                      null,
                      2,
                    ),
                  )
                  .then(() => toast.success("Error copied"));
              }}
            >
              <Copy className="mr-1 size-3" /> Copy
            </Button>
          </div>
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-destructive">
            {entry.error}
          </pre>
        </div>
      )}
      {entry.items && entry.items.length > 0 ? (
        <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
          {JSON.stringify(entry.items, null, 2)}
        </pre>
      ) : entry.status !== "error" ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">
          {entry.status === "running"
            ? "Node is running…"
            : entry.status === "pending"
              ? "Waiting to run…"
              : "No output items"}
        </p>
      ) : null}
      {(entry.startedAt || entry.finishedAt) && (
        <p className="px-1 text-[10px] text-muted-foreground">
          {entry.startedAt && `started ${new Date(entry.startedAt).toLocaleTimeString()}`}
          {entry.startedAt && entry.finishedAt && " · "}
          {entry.finishedAt && `finished ${new Date(entry.finishedAt).toLocaleTimeString()}`}
        </p>
      )}
    </div>
  );
}
