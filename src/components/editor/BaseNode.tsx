import { memo, useCallback, useMemo, type CSSProperties } from "react";
import { Handle, Position, useConnection, type NodeProps } from "@xyflow/react";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpenFlowNode } from "@/lib/workflow/graph";
import { channelHandleIds, handlesFor } from "@/lib/workflow/graph";
import {
  channelColor,
  channelEdgeColor,
  channelLabel,
  connectDragKey,
  handleConnectRole,
  isAiChannel,
  namedBaseForChannel,
  parseConnectDragKey,
  type HandleConnectRole,
} from "@/lib/workflow/channels";
import { useWorkflowStore } from "@/store/workflow-store";

export function NodeIcon({ name, className }: { name: string; className?: string }) {
  const Lucide = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    name
  ];
  const Fallback = Icons.Box;
  const Comp = Lucide ?? Fallback;
  return <Comp className={className} />;
}

export function accentFor(group?: string[] | null, placeholder?: boolean) {
  if (placeholder) return "placeholder";
  const g = Array.isArray(group) ? group : [];
  if (g.includes("trigger")) return "trigger";
  if (g.includes("transform")) return "logic";
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

function slotTop(i: number, total: number): string {
  return `${((i + 1) / (total + 1)) * 100}%`;
}

function BaseNodeInner({ data, selected, id }: NodeProps<OpenFlowNode>) {
  const node = data.node;
  const workflow = useWorkflowStore((s) => s.workflow);
  const openSlotPicker = useWorkflowStore((s) => s.openSlotPicker);
  const exec = (data as Record<string, unknown>).executionStatus as string | undefined;
  const { description, inputs, outputs } = handlesFor(node, workflow.connections);
  const inputHandleIds = channelHandleIds(inputs);
  const outputHandleIds = channelHandleIds(outputs);
  const group = Array.isArray(description.group) ? description.group : [];
  const accent = accentFor(group, description.placeholder);
  const styles = accentStyles[accent] ?? accentStyles.action!;
  const isTrigger = group.includes("trigger");
  const isRunning = exec === "running";
  const isSuccess = exec === "success";
  const isError = exec === "error";
  const isPending = exec === "pending";
  const isSkipped = exec === "skipped";

  const filledIn = new Set(data.filledInputs ?? []);
  const filledOut = new Set(data.filledOutputs ?? []);

  const dragKey = useConnection((c) =>
    connectDragKey(
      c.inProgress,
      c.inProgress ? c.fromNode?.id : null,
      c.inProgress ? (c.fromHandle?.id ?? null) : null,
      c.inProgress ? (c.fromHandle?.type ?? null) : null,
    ),
  );
  const drag = useMemo(() => parseConnectDragKey(dragKey), [dragKey]);
  const connecting = drag != null;

  const roleOf = useCallback(
    (handleId: string, handleType: "source" | "target"): HandleConnectRole =>
      handleConnectRole(drag, id, handleId, handleType),
    [drag, id],
  );

  const nodeHasCompatible = (() => {
    if (!drag) return false;
    for (const h of inputHandleIds) {
      if (handleConnectRole(drag, id, h, "target") === "compatible") return true;
    }
    for (const h of outputHandleIds) {
      if (handleConnectRole(drag, id, h, "source") === "compatible") return true;
    }
    return false;
  })();

  const showInputLabels =
    inputs.length > 1 || inputs.some(isAiChannel) || Boolean(description.inputNames?.length);
  const showOutputLabels =
    outputs.length > 1 || outputs.some(isAiChannel) || Boolean(description.outputNames?.length);

  const multiAi = inputs.filter(isAiChannel).length + outputs.filter(isAiChannel).length;
  const minHeight = Math.max(52, 36 + Math.max(inputs.length, outputs.length, multiAi) * 14);

  const onSlotPlus = useCallback(
    (e: React.MouseEvent, side: "input" | "output", channel: string, handleId: string) => {
      e.stopPropagation();
      e.preventDefault();
      openSlotPicker({
        nodeName: node.name,
        side,
        channel,
        handleId,
        x: e.clientX + 8,
        y: e.clientY - 8,
      });
    },
    [node.name, openSlotPicker],
  );

  const inputOrdinal = (i: number) => {
    const ch = inputs[i];
    let n = 0;
    for (let j = 0; j < i; j++) if (inputs[j] === ch) n++;
    return n;
  };
  const outputOrdinal = (i: number) => {
    const ch = outputs[i];
    let n = 0;
    for (let j = 0; j < i; j++) if (outputs[j] === ch) n++;
    return n;
  };

  const inputLabel = (channel: string, i: number) => {
    const ord = inputOrdinal(i);
    return channelLabel(
      channel,
      ord,
      namedBaseForChannel(channel, description.inputs, description.inputNames, ord),
    );
  };
  const outputLabel = (channel: string, i: number) => {
    const ord = outputOrdinal(i);
    return channelLabel(
      channel,
      ord,
      namedBaseForChannel(channel, description.outputs, description.outputNames, ord),
    );
  };

  const handleVisual = (
    handleId: string,
    handleType: "source" | "target",
    channel: string,
    filled: boolean,
    multiSide: boolean,
  ) => {
    const isAi = isAiChannel(channel);
    const idleColor = isAi || multiSide ? channelColor(channel) : undefined;
    const accent = isAi ? channelColor(channel) : "var(--primary)";
    const role = roleOf(handleId, handleType);
    let opacity = filled || !isAi ? 1 : 0.55;
    let width = isAi ? 12 : 8;
    let height = isAi ? 12 : 8;
    let boxShadow: string | undefined;
    let zIndex: number | undefined;
    let background: string | undefined = idleColor;

    if (role === "incompatible") {
      opacity = 0.18;
      background = "var(--color-border)";
      boxShadow = undefined;
    } else if (role === "compatible") {
      opacity = 1;
      width = isAi ? 16 : 12;
      height = isAi ? 16 : 12;
      background = accent;
      boxShadow = `0 0 0 3px color-mix(in oklch, ${accent} 45%, transparent), 0 0 12px color-mix(in oklch, ${accent} 55%, transparent)`;
      zIndex = 20;
    } else if (role === "origin") {
      opacity = 1;
      background = accent;
      boxShadow = `0 0 0 2px var(--background), 0 0 0 4px ${accent}`;
      zIndex = 20;
    }

    return {
      role,
      style: {
        width,
        height,
        background,
        border:
          isAi || role === "compatible" || role === "origin"
            ? "2px solid var(--background)"
            : undefined,
        opacity,
        boxShadow,
        zIndex,
        transition:
          "opacity 120ms ease, width 120ms ease, height 120ms ease, box-shadow 120ms ease",
      } satisfies CSSProperties,
    };
  };

  return (
    <div
      className={cn(
        "relative",
        connecting && !nodeHasCompatible && drag?.fromNodeId !== id && "of-node-connect-dim",
      )}
      style={{ minHeight }}
    >
      {inputs.map((channel, i) => {
        const handleId = inputHandleIds[i];
        const filled =
          channel === "ai_tool"
            ? [...filledIn].some((h) => h.startsWith("ai_tool-"))
            : filledIn.has(handleId);
        const label = inputLabel(channel, i);
        const { role, style } = handleVisual(
          handleId,
          "target",
          channel,
          filled,
          inputs.length > 1,
        );
        return (
          <Handle
            key={`in-${handleId}`}
            id={handleId}
            type="target"
            position={Position.Left}
            style={{
              top: slotTop(i, inputs.length),
              ...style,
            }}
            title={
              role === "compatible"
                ? `Drop here · ${label}`
                : role === "incompatible"
                  ? `Incompatible · ${label}`
                  : label
            }
            className={cn(
              isAiChannel(channel) && "of-handle-ai",
              role === "compatible" && "of-handle-compatible",
              role === "incompatible" && "of-handle-incompatible",
              role === "origin" && "of-handle-origin",
            )}
          />
        );
      })}

      {showInputLabels &&
        inputs.map((channel, i) => {
          const handleId = inputHandleIds[i];
          const filled =
            channel === "ai_tool"
              ? [...filledIn].some((h) => h.startsWith("ai_tool-"))
              : filledIn.has(handleId);
          const label = inputLabel(channel, i);
          const color = channelColor(channel);
          const role = roleOf(handleId, "target");
          const showPlus =
            !connecting &&
            (channel === "ai_tool" || (!filled && (isAiChannel(channel) || inputs.length > 1)));
          return (
            <div
              key={`in-label-${handleId}`}
              className={cn(
                "pointer-events-none absolute -left-1 z-10 flex -translate-x-full -translate-y-1/2 items-center justify-end gap-1 pr-2 transition-opacity duration-120",
                role === "incompatible" && "opacity-25",
                role === "compatible" && "opacity-100",
              )}
              style={{ top: slotTop(i, inputs.length) }}
            >
              {showPlus && (
                <button
                  type="button"
                  onClick={(e) => onSlotPlus(e, "input", channel, handleId)}
                  className={cn(
                    "pointer-events-auto grid size-4 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm",
                    "transition-colors hover:border-primary hover:text-primary",
                    "nodrag nopan",
                  )}
                  style={{ borderColor: isAiChannel(channel) ? color : undefined }}
                  aria-label={`Add ${label}`}
                  title={`Add ${label}`}
                >
                  <Icons.Plus className="size-2.5" />
                </button>
              )}
              <span
                className={cn(
                  "max-w-[88px] truncate text-right font-mono text-[9px] uppercase tracking-wide",
                  role === "compatible" && "font-semibold",
                  filled && role === "idle" ? "text-foreground/80" : "text-muted-foreground",
                )}
                style={isAiChannel(channel) || role === "compatible" ? { color } : undefined}
                title={label}
              >
                {label}
              </span>
            </div>
          );
        })}

      <div
        aria-label={node.name}
        className={cn(
          "of-node-shell relative flex w-[228px] items-center gap-3 overflow-hidden border border-border border-l-4 bg-surface px-3 py-3 shadow-lg transition-all duration-300",
          isTrigger ? "rounded-l-2xl rounded-r-md" : "rounded-md",
          styles.ring,
          selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          node.disabled && "opacity-45 grayscale",
          connecting && nodeHasCompatible && "ring-1 ring-offset-1 ring-offset-background",
          isRunning &&
            "border-blue-500/60 shadow-[0_0_0_2px_rgba(59,130,246,0.35),0_0_20px_rgba(59,130,246,0.25)]",
          isSuccess && "border-emerald-500/50 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]",
          isError &&
            "border-red-500/60 shadow-[0_0_0_2px_rgba(239,68,68,0.35)] animate-[shake_0.4s_ease-in-out]",
          isPending && "opacity-70",
          isSkipped && "opacity-50 grayscale",
        )}
        style={{
          minHeight,
          ...(connecting && nodeHasCompatible && drag
            ? {
                boxShadow: `0 0 0 1px color-mix(in oklch, ${channelEdgeColor(drag.channel)} 55%, transparent)`,
              }
            : {}),
        }}
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
        {node.disabled && (
          <Icons.PowerOff className="relative size-4 shrink-0 text-muted-foreground" />
        )}

        {isRunning && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden bg-blue-500/20">
            <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] bg-blue-500" />
          </div>
        )}
      </div>

      {outputs.map((channel, i) => {
        const handleId = outputHandleIds[i];
        const filled = filledOut.has(handleId);
        const label = outputLabel(channel, i);
        const { role, style } = handleVisual(
          handleId,
          "source",
          channel,
          filled,
          outputs.length > 1,
        );
        return (
          <Handle
            key={`out-${handleId}`}
            id={handleId}
            type="source"
            position={Position.Right}
            style={{
              top: slotTop(i, outputs.length),
              ...style,
            }}
            title={
              role === "compatible"
                ? `Drop here · ${label}`
                : role === "incompatible"
                  ? `Incompatible · ${label}`
                  : label
            }
            className={cn(
              isAiChannel(channel) && "of-handle-ai",
              role === "compatible" && "of-handle-compatible",
              role === "incompatible" && "of-handle-incompatible",
              role === "origin" && "of-handle-origin",
            )}
          />
        );
      })}

      {showOutputLabels &&
        outputs.map((channel, i) => {
          const handleId = outputHandleIds[i];
          const filled = filledOut.has(handleId);
          const label = outputLabel(channel, i);
          const color = channelColor(channel);
          const role = roleOf(handleId, "source");
          const showPlus = !connecting && !filled && isAiChannel(channel);
          return (
            <div
              key={`out-label-${handleId}`}
              className={cn(
                "pointer-events-none absolute -right-1 z-10 flex translate-x-full -translate-y-1/2 items-center justify-start gap-1 pl-2 transition-opacity duration-120",
                role === "incompatible" && "opacity-25",
                role === "compatible" && "opacity-100",
              )}
              style={{ top: slotTop(i, outputs.length) }}
            >
              <span
                className={cn(
                  "max-w-[88px] truncate font-mono text-[9px] uppercase tracking-wide",
                  role === "compatible" && "font-semibold",
                  filled && role === "idle" ? "text-foreground/80" : "text-muted-foreground",
                )}
                style={isAiChannel(channel) || role === "compatible" ? { color } : undefined}
                title={label}
              >
                {label}
              </span>
              {showPlus && (
                <button
                  type="button"
                  onClick={(e) => onSlotPlus(e, "output", channel, handleId)}
                  className={cn(
                    "pointer-events-auto grid size-4 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm",
                    "transition-colors hover:border-primary hover:text-primary",
                    "nodrag nopan",
                  )}
                  style={{ borderColor: color }}
                  aria-label={`Connect ${label}`}
                  title={`Connect ${label}`}
                >
                  <Icons.Plus className="size-2.5" />
                </button>
              )}
            </div>
          );
        })}
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
