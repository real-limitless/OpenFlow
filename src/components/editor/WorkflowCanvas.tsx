import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflow-store";
import { toFlowEdges, toFlowNodes, type OpenFlowNode } from "@/lib/workflow/graph";
import type { ExecutionRunData } from "@/lib/engine/types";
import { BaseNode, StickyNode } from "./BaseNode";
import { OpenFlowEdge } from "./OpenFlowEdge";

const nodeTypes = { openflow: BaseNode, sticky: StickyNode };
const edgeTypes = { openflow: OpenFlowEdge };

function CanvasInner({ runData }: { runData: ExecutionRunData | null }) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const selectedNode = useWorkflowStore((s) => s.selectedNode);
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
  } = useWorkflowStore();
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);

  const nodes = useMemo(() => {
    const base = toFlowNodes(workflow, selectedNode);
    if (!runData) return base;
    return base.map((n) => ({
      ...n,
      data: { ...n.data, executionStatus: runData[n.id]?.status },
    }));
  }, [workflow, selectedNode, runData]);
  const edges = useMemo(() => toFlowEdges(workflow), [workflow]);

  const onNodesChange = useCallback(
    (changes: NodeChange<OpenFlowNode>[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          moveNode(change.id, change.position);
        }
      }
    },
    [moveNode],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      connect(c.source, c.sourceHandle, c.target, c.targetHandle);
    },
    [connect],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
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
  ]);

  return (
    <div
      ref={wrapper}
      role="application"
      aria-label="Workflow canvas"
      className="group/canvas h-full w-full"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => selectNode(n.id)}
        onEdgeClick={(_, edge) => {
          setSelectedEdge(edge.id);
          selectNode(null);
        }}
        onPaneClick={() => {
          selectNode(null);
          setSelectedEdge(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const type = e.dataTransfer.getData("application/openflow-node");
          if (!type) return;
          const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          addNode(type, { x: position.x - 110, y: position.y - 24 });
        }}
        defaultEdgeOptions={{ type: "openflow" }}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1, minZoom: 0.6 }}
        minZoom={0.15}
        maxZoom={2}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
      >
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
          maskColor="oklch(0.12 0.01 258 / 0.7)"
          nodeColor={() => "var(--primary)"}
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas({ runData }: { runData: ExecutionRunData | null }) {
  return (
    <ReactFlowProvider>
      <CanvasInner runData={runData} />
    </ReactFlowProvider>
  );
}
