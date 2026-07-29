import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";

const INSERTABLE_TYPES = [
  { type: "n8n-nodes-base.set", label: "Set" },
  { type: "n8n-nodes-base.noOp", label: "NoOp" },
  { type: "n8n-nodes-base.if", label: "IF" },
  { type: "n8n-nodes-base.code", label: "Code" },
  { type: "n8n-nodes-base.httpRequest", label: "HTTP Request" },
];

export function OpenFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const disconnect = useWorkflowStore((s) => s.disconnect);
  const insertNodeOnEdge = useWorkflowStore((s) => s.insertNodeOnEdge);
  const [menuOpen, setMenuOpen] = useState(false);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected ? "var(--primary)" : "var(--border)",
          strokeWidth: selected ? 2.5 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={() => disconnect(id)}
          className="pointer-events-auto absolute grid size-5 place-items-center rounded-full border border-border bg-surface text-muted-foreground opacity-0 transition hover:border-destructive hover:text-destructive focus:opacity-100 group-hover/canvas:opacity-100"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          aria-label="Remove connection"
        >
          <X className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="pointer-events-auto absolute grid size-5 place-items-center rounded-full border border-border bg-surface text-muted-foreground opacity-0 transition hover:border-primary hover:text-primary focus:opacity-100 group-hover/canvas:opacity-100"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) translateX(-12px)`,
          }}
          aria-label="Insert node"
        >
          <Plus className="size-3" />
        </button>
        {menuOpen && (
          <>
            <div
              className="pointer-events-auto fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="pointer-events-auto absolute z-20 min-w-28 rounded-md border border-border bg-surface p-1 text-sm shadow-md"
              style={{
                transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY}px) translateX(-12px) translateY(-10px)`,
              }}
            >
              {INSERTABLE_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    insertNodeOnEdge(id, t.type);
                    setMenuOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-muted"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
