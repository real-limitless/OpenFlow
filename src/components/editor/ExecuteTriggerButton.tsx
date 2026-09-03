import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAnyChatTriggerNode } from "@/lib/chat/path";
import { listTriggerNodes } from "@/lib/engine/graph";
import { getNodeType } from "@/lib/nodes/registry";
import type { IWorkflow } from "@/lib/workflow/types";
import { cn } from "@/lib/utils";

function storageKey(workflowId: string) {
  return `openflow.executeStartNode:${workflowId}`;
}

export function ExecuteTriggerButton({
  workflow,
  isExecuting,
  onExecute,
  onOpenChat,
}: {
  workflow: IWorkflow;
  isExecuting: boolean;
  onExecute: (startNode?: string) => void;
  onOpenChat?: () => void;
}) {
  const triggers = useMemo(() => listTriggerNodes(workflow), [workflow]);
  const [selected, setSelected] = useState<string | null>(null);

  // Keep selection valid when nodes rename/delete; restore from localStorage
  useEffect(() => {
    const names = new Set(triggers.map((t) => t.name));
    setSelected((prev) => {
      if (prev && names.has(prev)) return prev;
      const stored =
        typeof window !== "undefined" ? window.localStorage.getItem(storageKey(workflow.id)) : null;
      if (stored && names.has(stored)) return stored;
      if (triggers.length === 0) return null;
      const manual = triggers.find((n) => {
        const t = n.type;
        return (
          t === "openflow-node-base.manualTrigger" ||
          t === "openflow-node-base.manualWorkflowTrigger" ||
          t === "openflow-node-base.start" ||
          t === "n8n-nodes-base.manualTrigger" ||
          t === "n8n-nodes-base.manualWorkflowTrigger" ||
          t === "n8n-nodes-base.start"
        );
      });
      return manual?.name ?? triggers[0]!.name;
    });
  }, [workflow.id, triggers]);

  const choose = (name: string) => {
    setSelected(name);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey(workflow.id), name);
    }
  };

  const activeName = selected && triggers.some((t) => t.name === selected) ? selected : triggers[0]?.name;
  const activeLabel = activeName
    ? (() => {
        const node = triggers.find((t) => t.name === activeName);
        if (!node) return activeName;
        const typeLabel = getNodeType(node.type).displayName;
        return node.name === typeLabel ? node.name : `${node.name}`;
      })()
    : null;

  const run = (start?: string) => {
    const name = start ?? activeName ?? undefined;
    const node = name ? triggers.find((t) => t.name === name) : undefined;
    if (node && isAnyChatTriggerNode(node) && onOpenChat) {
      onOpenChat();
      return;
    }
    onExecute(name);
  };

  if (triggers.length <= 1) {
    return (
      <Button
        variant="default"
        size="sm"
        className="h-8 text-[12px]"
        onClick={() => run(triggers[0]?.name)}
        disabled={isExecuting}
        title={triggers[0] ? `Execute from ${triggers[0].name}` : "Execute workflow"}
      >
        <Play className="mr-1 size-3.5" />
        {isExecuting ? "Running…" : "Execute"}
      </Button>
    );
  }

  return (
    <div className="flex items-center">
      <Button
        variant="default"
        size="sm"
        className="h-8 rounded-r-none text-[12px]"
        onClick={() => run()}
        disabled={isExecuting}
        title={activeName ? `Execute from ${activeName}` : "Execute workflow"}
      >
        <Play className="mr-1 size-3.5" />
        {isExecuting ? "Running…" : "Execute"}
        {activeLabel && !isExecuting && (
          <span className="ml-1.5 max-w-[7rem] truncate font-normal opacity-80">· {activeLabel}</span>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size="sm"
            className="h-8 rounded-l-none border-l border-primary-foreground/20 px-1.5"
            disabled={isExecuting}
            aria-label="Choose trigger to execute"
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            Run from trigger
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {triggers.map((t) => {
            const typeLabel = getNodeType(t.type).displayName;
            const isActive = t.name === activeName;
            return (
              <DropdownMenuItem
                key={t.name}
                className="flex cursor-pointer items-start gap-2 text-[12px]"
                onClick={() => {
                  choose(t.name);
                  run(t.name);
                }}
              >
                <Check
                  className={cn("mt-0.5 size-3.5 shrink-0", isActive ? "opacity-100" : "opacity-0")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{typeLabel}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-[11px] text-muted-foreground"
            onClick={() => {
              if (activeName) choose(activeName);
            }}
          >
            Selected: {activeLabel ?? "—"} (click a trigger to run)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
