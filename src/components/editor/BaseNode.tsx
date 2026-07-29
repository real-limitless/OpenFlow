import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpenFlowNode } from "@/lib/workflow/graph";
import { handlesFor } from "@/lib/workflow/graph";

export function NodeIcon({ name, className }: { name: string; className?: string }) {
  const Lucide = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    name
  ];
  const Fallback = Icons.Box;
  const Comp = Lucide ?? Fallback;
  return <Comp className={className} />;
}

export function accentFor(group: string[], placeholder?: boolean) {
  if (placeholder) return "placeholder";
  if (group.includes("trigger")) return "trigger";
  if (group.includes("transform")) return "logic";
  return "action";
}

const accentStyles: Record<string, { ring: string; text: string; bg: string }> = {
  trigger: {
    ring: "border-l-[var(--trigger)]",
    text: "text-[var(--trigger)]",
    bg: "bg-[var(--trigger)]/12",
  },
  logic: {
    ring: "border-l-[var(--logic)]",
    text: "text-[var(--logic)]",
    bg: "bg-[var(--logic)]/12",
  },
  action: {
    ring: "border-l-[var(--action)]",
    text: "text-[var(--action)]",
    bg: "bg-[var(--action)]/12",
  },
  placeholder: {
    ring: "border-l-[var(--placeholder)]",
    text: "text-[var(--placeholder)]",
    bg: "bg-[var(--placeholder)]/12",
  },
};

function BaseNodeInner({ data }: NodeProps<OpenFlowNode>) {
  const node = data.node;
  const exec = (data as Record<string, unknown>).executionStatus as string | undefined;
  const { description, inputs, outputs } = handlesFor(node);
  const accent = accentFor(description.group, description.placeholder);
  const styles = accentStyles[accent];
  const isTrigger = description.group.includes("trigger");
  const isRunning = exec === "running";
  const isSuccess = exec === "success";
  const isError = exec === "error";
  const isPending = exec === "pending";
  const isSkipped = exec === "skipped";

  return (
    <div className="relative">
      {inputs.map((channel, i) => {
        const isAi = channel.startsWith("ai_");
        return (
          <Handle
            key={`in-${channel}-${i}`}
            id={`${channel}-${i}`}
            type="target"
            position={Position.Left}
            style={{
              top: `${((i + 1) / (inputs.length + 1)) * 100}%`,
              width: isAi ? 12 : 8,
              height: isAi ? 12 : 8,
              background: isAi ? "var(--ai-handle)" : undefined,
              border: isAi ? "2px solid var(--background)" : undefined,
            }}
            title={isAi ? channel : undefined}
          />
        );
      })}

      <div
        className={cn(
          "of-node-shell relative flex w-[228px] items-center gap-3 overflow-hidden border border-border border-l-4 bg-surface px-3 py-3 shadow-lg transition-all duration-300",
          isTrigger ? "rounded-l-2xl rounded-r-md" : "rounded-md",
          styles.ring,
          node.disabled && "opacity-45 grayscale",
          isRunning &&
            "border-blue-500/60 shadow-[0_0_0_2px_rgba(59,130,246,0.35),0_0_20px_rgba(59,130,246,0.25)]",
          isSuccess && "border-emerald-500/50 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]",
          isError && "border-red-500/60 shadow-[0_0_0_2px_rgba(239,68,68,0.35)] animate-[shake_0.4s_ease-in-out]",
          isPending && "opacity-70",
          isSkipped && "opacity-50 grayscale",
        )}
      >
        {isRunning && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 animate-pulse bg-blue-500/10" />
            <div className="absolute inset-y-0 w-1/2 animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-blue-400/20 to-transparent" />
          </div>
        )}

        <div
          className={cn(
            "relative grid size-9 shrink-0 place-items-center rounded-md",
            styles.bg,
            isRunning && "ring-2 ring-blue-400/60 ring-offset-1 ring-offset-surface",
          )}
        >
          {isRunning ? (
            <Icons.Loader2 className={cn("size-[18px] animate-spin text-blue-500")} />
          ) : isSuccess ? (
            <Icons.CheckCircle2 className="size-[18px] text-emerald-500" />
          ) : isError ? (
            <Icons.XCircle className="size-[18px] text-red-500" />
          ) : (
            <NodeIcon name={description.icon} className={cn("size-[18px]", styles.text)} />
          )}
        </div>

        <div className="relative min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight text-foreground">
            {node.name}
          </p>
          <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {isRunning
              ? "running…"
              : description.placeholder
                ? "unsupported"
                : description.displayName}
          </p>
        </div>

        {description.placeholder && !exec && (
          <Icons.TriangleAlert className="relative size-4 shrink-0 text-[var(--warning)]" />
        )}
        {node.disabled && <Icons.PowerOff className="relative size-4 shrink-0 text-muted-foreground" />}

        {isRunning && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden bg-blue-500/20">
            <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] bg-blue-500" />
          </div>
        )}
      </div>

      {outputs.map((channel, i) => {
        const isAi = channel.startsWith("ai_");
        return (
          <Handle
            key={`out-${channel}-${i}`}
            id={`${channel}-${i}`}
            type="source"
            position={Position.Right}
            style={{
              top: `${((i + 1) / (outputs.length + 1)) * 100}%`,
              width: isAi ? 12 : 8,
              height: isAi ? 12 : 8,
              background: isAi ? "var(--ai-handle)" : undefined,
              border: isAi ? "2px solid var(--background)" : undefined,
            }}
            title={isAi ? channel : undefined}
          />
        );
      })}

      {outputs.length > 1 && (
        <div className="pointer-events-none absolute -right-1 top-0 flex h-full translate-x-full flex-col justify-around pl-2">
          {outputs.map((_, i) => (
            <span
              key={i}
              className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground"
            >
              {description.outputNames?.[i] ?? i}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const BaseNode = memo(BaseNodeInner);

function StickyInner({ data }: NodeProps<OpenFlowNode>) {
  const params = data.node.parameters as {
    content?: string;
    width?: number;
    height?: number;
    color?: number;
  };
  const palette: Record<number, string> = {
    1: "bg-[oklch(0.32_0.03_85)]/70 border-[oklch(0.5_0.06_85)]",
    2: "bg-[oklch(0.3_0.05_180)]/70 border-[oklch(0.5_0.08_180)]",
    3: "bg-[oklch(0.33_0.06_70)]/70 border-[oklch(0.55_0.1_70)]",
    4: "bg-[oklch(0.32_0.06_10)]/70 border-[oklch(0.52_0.1_10)]",
  };
  return (
    <div
      className={cn(
        "of-node-shell overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-[13px] leading-snug text-foreground/90",
        palette[params.color ?? 1] ?? palette[1],
      )}
      style={{ width: params.width ?? 320, height: params.height ?? 180 }}
    >
      {params.content ?? ""}
    </div>
  );
}

export const StickyNode = memo(StickyInner);
