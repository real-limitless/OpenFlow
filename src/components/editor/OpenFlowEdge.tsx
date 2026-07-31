import { useEffect, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { channelEdgeColor, channelLabel, isAiChannel } from "@/lib/workflow/channels";

const INSERTABLE_TYPES = [
  { type: "n8n-nodes-base.set", label: "Set" },
  { type: "n8n-nodes-base.noOp", label: "NoOp" },
  { type: "n8n-nodes-base.if", label: "IF" },
  { type: "n8n-nodes-base.code", label: "Code" },
  { type: "n8n-nodes-base.httpRequest", label: "HTTP Request" },
];

type MenuPhase = "closed" | "actions" | "insert";

type EdgeData = { channel?: string; color?: string };

export function OpenFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  style,
}: EdgeProps) {
  const disconnect = useWorkflowStore((s) => s.disconnect);
  const insertNodeOnEdge = useWorkflowStore((s) => s.insertNodeOnEdge);
  const [phase, setPhase] = useState<MenuPhase>("closed");
  const [hovered, setHovered] = useState(false);

  const channel = (data as EdgeData | undefined)?.channel ?? "main";
  const channelColor = (data as EdgeData | undefined)?.color ?? channelEdgeColor(channel);
  const ai = isAiChannel(channel);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });

  const active = phase !== "closed" || selected || hovered;

  useEffect(() => {
    if (phase === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhase("closed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const close = () => {
    setPhase("closed");
    setHovered(false);
  };

  const stroke = active
    ? ai
      ? channelColor
      : "var(--primary)"
    : ai
      ? channelColor
      : ((style?.stroke as string | undefined) ?? "var(--border)");

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          stroke,
          strokeWidth: active ? 2.5 : ai ? 2.25 : 2,
          opacity: active ? 1 : ai ? 0.85 : 1,
          transition: "stroke 150ms ease, stroke-width 150ms ease, opacity 150ms ease",
        }}
        interactionWidth={20}
      />
      <EdgeLabelRenderer>
        {phase !== "closed" && (
          <div className="pointer-events-auto fixed inset-0 z-10" onClick={close} aria-hidden />
        )}

        <div
          className="pointer-events-auto absolute z-20 flex min-h-8 min-w-8 items-center justify-center"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => {
            if (phase === "closed") setHovered(false);
          }}
        >
          <div
            className={cn(
              "flex items-center justify-center transition-all duration-200 ease-out",
              active ? "scale-100 opacity-100" : "scale-75 opacity-0",
            )}
          >
            {phase === "closed" && (
              <div className="flex items-center gap-1">
                {ai && (
                  <span
                    className="rounded-full border border-border bg-surface px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide shadow-sm"
                    style={{ color: channelColor, borderColor: channelColor }}
                  >
                    {channelLabel(channel)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhase("actions");
                  }}
                  className={cn(
                    "grid size-6 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm",
                    "transition-all duration-200 hover:border-primary hover:text-primary",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    !active && "pointer-events-none",
                  )}
                  aria-label="Edge actions"
                  aria-expanded={false}
                  tabIndex={active ? 0 : -1}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            )}

            {phase === "actions" && (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full border border-border bg-surface p-0.5 shadow-md",
                  "animate-in fade-in zoom-in-95 duration-150",
                )}
                role="menu"
                aria-label="Edge actions"
              >
                {!ai && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhase("insert");
                      }}
                      className={cn(
                        "flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-foreground",
                        "transition-colors hover:bg-primary/10 hover:text-primary",
                      )}
                      aria-label="Insert node"
                    >
                      <Plus className="size-3.5" />
                      Insert
                    </button>
                    <span className="h-4 w-px bg-border" aria-hidden />
                  </>
                )}
                {ai && (
                  <span
                    className="px-2 font-mono text-[10px] uppercase tracking-wide"
                    style={{ color: channelColor }}
                  >
                    {channelLabel(channel)}
                  </span>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    disconnect(id);
                    close();
                  }}
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-foreground",
                    "transition-colors hover:bg-destructive/10 hover:text-destructive",
                  )}
                  aria-label="Remove connection"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </button>
              </div>
            )}

            {phase === "insert" && (
              <div
                className={cn(
                  "min-w-36 rounded-md border border-border bg-surface p-1 text-sm shadow-md",
                  "animate-in fade-in zoom-in-95 duration-150",
                )}
                role="menu"
                aria-label="Insert node type"
              >
                <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Insert node
                </p>
                {INSERTABLE_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      insertNodeOnEdge(id, t.type);
                      close();
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-muted"
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhase("actions");
                  }}
                  className="mt-0.5 block w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted"
                >
                  ← Back
                </button>
              </div>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
