import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useConnection,
  useReactFlow,
  type Connection,
  type NodeChange,
  type OnConnectStartParams,
} from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflow-store";
import { toFlowEdges, toFlowNodes, type OpenFlowNode } from "@/lib/workflow/graph";
import { channelEdgeColor, isCompatibleConnection, parseHandle } from "@/lib/workflow/channels";
import type { ExecutionRunData } from "@/lib/engine/types";
import { BaseNode, StickyNode } from "./BaseNode";
import { OpenFlowEdge } from "./OpenFlowEdge";
import { SlotNodePicker } from "./SlotNodePicker";
import { InspectMediaNode, InspectTableNode } from "./InspectNodes";
import { decodeNodeDragPayload } from "@/lib/workflow/add-node";

const nodeTypes = {
  openflow: BaseNode,
  sticky: StickyNode,
  inspectTable: InspectTableNode,
  inspectMedia: InspectMediaNode,
};
const edgeTypes = { openflow: OpenFlowEdge };

function CanvasInner({
  runData,
  refreshKey = 0,
}: {
  runData: ExecutionRunData | null;
  refreshKey?: number;
}) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const selectedNode = useWorkflowStore((s) => s.selectedNode);
  const slotPicker = useWorkflowStore((s) => s.slotPicker);
  const {
    selectNode,
    moveNode,
    connect,
    addNode,
    deleteNode,
    duplicateNode,
    disconnect,
    undo,
    redo,
    closeSlotPicker,
    addConnectedNode,
  } = useWorkflowStore();
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [connectionLineStyle, setConnectionLineStyle] = useState<React.CSSProperties>({
    stroke: "var(--primary)",
    strokeWidth: 2,
  });

  /** RF measures DOM size; MiniMap reads dimensions from the controlled nodes prop. */
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

  const nodes = useMemo(() => {
    const base = toFlowNodes(workflow, selectedNode);
    return base.map((n) => {
      const m = measured[n.id];
      return {
        ...n,
        ...(m ? { width: m.width, height: m.height, measured: m } : null),
        data: {
          ...n.data,
          executionStatus: runData?.[n.id]?.status,
          runData,
          refreshKey,
        },
      };
    });
  }, [workflow, selectedNode, runData, refreshKey, measured]);
  const edges = useMemo(() => toFlowEdges(workflow), [workflow]);

  const onNodesChange = useCallback(
    (changes: NodeChange<OpenFlowNode>[]) => {
      let nextMeasured: Record<string, { width: number; height: number }> | null = null;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          moveNode(change.id, change.position);
        }
        if (change.type === "dimensions" && change.dimensions) {
          nextMeasured ??= {};
          nextMeasured[change.id] = change.dimensions;
        }
      }
      if (nextMeasured) {
        const patch = nextMeasured;
        setMeasured((prev) => {
          let changed = false;
          const out = { ...prev };
          for (const [id, dim] of Object.entries(patch)) {
            const cur = prev[id];
            if (!cur || cur.width !== dim.width || cur.height !== dim.height) {
              out[id] = dim;
              changed = true;
            }
          }
          return changed ? out : prev;
        });
      }
    },
    [moveNode],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      if (!isCompatibleConnection(c.sourceHandle, c.targetHandle)) return;
      connect(c.source, c.sourceHandle, c.target, c.targetHandle);
    },
    [connect],
  );

  const isValidConnection = useCallback((c: Connection | EdgeLike) => {
    if (!c.source || !c.target) return false;
    if (c.source === c.target) return false;
    return isCompatibleConnection(c.sourceHandle, c.targetHandle);
  }, []);

  const onConnectStart = useCallback((_: unknown, params: OnConnectStartParams) => {
    const [channel] = parseHandle(params.handleId);
    const stroke = channelEdgeColor(channel);
    setConnectionLineStyle({
      stroke,
      strokeWidth: channel.startsWith("ai_") ? 2.5 : 2,
    });
  }, []);

  const onConnectEnd = useCallback(() => {
    setConnectionLineStyle({ stroke: "var(--primary)", strokeWidth: 2 });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (meta && e.key.toLowerCase() === "d" && selectedNode) {
        e.preventDefault();
        duplicateNode(selectedNode);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedNode) {
        e.preventDefault();
        deleteNode(selectedNode);
      } else if ((e.key === "Delete" || e.key === "Backspace") && !selectedNode && selectedEdge) {
        e.preventDefault();
        disconnect(selectedEdge);
        setSelectedEdge(null);
      } else if (e.key === "Escape") {
        selectNode(null);
        setSelectedEdge(null);
        closeSlotPicker();
      } else if (selectedNode && !meta && e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 20 : 1;
        const node = workflow.nodes.find((n) => n.name === selectedNode);
        if (!node) return;
        e.preventDefault();
        if (e.key === "ArrowUp") {
          moveNode(selectedNode, { x: node.position[0], y: node.position[1] - step });
        } else if (e.key === "ArrowDown") {
          moveNode(selectedNode, { x: node.position[0], y: node.position[1] + step });
        } else if (e.key === "ArrowLeft") {
          moveNode(selectedNode, { x: node.position[0] - step, y: node.position[1] });
        } else if (e.key === "ArrowRight") {
          moveNode(selectedNode, { x: node.position[0] + step, y: node.position[1] });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    selectedNode,
    selectedEdge,
    workflow.nodes,
    deleteNode,
    disconnect,
    duplicateNode,
    moveNode,
    undo,
    redo,
    selectNode,
    closeSlotPicker,
  ]);

  return (
    <div
      ref={wrapper}
      role="application"
      aria-label="Workflow canvas"
      className="group/canvas relative h-full w-full"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        connectionLineStyle={connectionLineStyle}
        onNodeClick={(_, n) => {
          selectNode(n.id);
          closeSlotPicker();
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdge(edge.id);
          selectNode(null);
          closeSlotPicker();
        }}
        onPaneClick={() => {
          selectNode(null);
          setSelectedEdge(null);
          closeSlotPicker();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const raw =
            e.dataTransfer.getData("application/openflow-node") ||
            e.dataTransfer.getData("text/plain");
          const payload = decodeNodeDragPayload(raw);
          if (!payload) return;
          const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          addNode(
            payload.type,
            { x: position.x - 110, y: position.y - 24 },
            { name: payload.name, parameters: payload.parameters },
          );
        }}
        defaultEdgeOptions={{ type: "openflow" }}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1, minZoom: 0.6 }}
        minZoom={0.15}
        maxZoom={2}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        className="of-flow"
      >
        <ConnectModeClass />
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.5}
          color="var(--canvas-dot)"
          style={{ backgroundColor: "var(--canvas)" }}
        />
        <Controls showInteractive={false} className="!border-border" />
        <MiniMap
          pannable
          zoomable
          bgColor="var(--surface)"
          maskColor="oklch(0.12 0.01 258 / 0.55)"
          nodeColor="var(--primary)"
          nodeStrokeColor="var(--border)"
          nodeStrokeWidth={2}
        />
      </ReactFlow>
      <SlotNodePicker
        target={slotPicker}
        onClose={closeSlotPicker}
        onPick={(type, target) => addConnectedNode(type, target)}
      />
    </div>
  );
}

/** Minimal shape so isValidConnection accepts RF Connection without extra imports. */
type EdgeLike = {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

/** Toggles `.connecting` on the flow root while a wire is being dragged. */
function ConnectModeClass() {
  const inProgress = useConnection((c) => c.inProgress);
  useEffect(() => {
    const el = document.querySelector(".react-flow.of-flow");
    if (!el) return;
    el.classList.toggle("connecting", inProgress);
    return () => el.classList.remove("connecting");
  }, [inProgress]);
  return null;
}

export function WorkflowCanvas({
  runData,
  refreshKey = 0,
}: {
  runData: ExecutionRunData | null;
  refreshKey?: number;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner runData={runData} refreshKey={refreshKey} />
    </ReactFlowProvider>
  );
}
