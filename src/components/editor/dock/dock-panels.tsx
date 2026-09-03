import type { IDockviewPanelProps } from "dockview-react";
import { NodePalette } from "@/components/editor/NodePalette";
import { WorkflowCanvas } from "@/components/editor/WorkflowCanvas";
import { DataPanel } from "@/components/editor/DataPanel";
import { DataTablesPanel } from "@/components/editor/DataTablesPanel";
import { ExecutionHistory } from "@/components/editor/ExecutionHistory";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { AssistantPanel } from "@/components/editor/AssistantPanel";
import { WorkflowChatPanel } from "@/components/editor/WorkflowChatPanel";
import type { ExecutionRunData } from "@/lib/engine/types";
import { useEditorDock } from "./EditorDockContext";

function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className="of-dock-panel">{children}</div>;
}

export function DockCanvasPanel(_props: IDockviewPanelProps) {
  const { runData, historyKey } = useEditorDock();
  return (
    <PanelShell>
      <div className="min-h-0 min-w-0 flex-1 bg-[var(--canvas)]">
        <WorkflowCanvas runData={runData} refreshKey={historyKey} />
      </div>
    </PanelShell>
  );
}

export function DockNodesPanel(_props: IDockviewPanelProps) {
  const { onAddNode } = useEditorDock();
  return (
    <PanelShell>
      <NodePalette onAdd={onAddNode} />
    </PanelShell>
  );
}

export function DockExecutionPanel(_props: IDockviewPanelProps) {
  const { runData } = useEditorDock();
  return (
    <PanelShell>
      <DataPanel runData={runData} />
    </PanelShell>
  );
}

export function DockTablesPanel(_props: IDockviewPanelProps) {
  const { historyKey } = useEditorDock();
  return (
    <PanelShell>
      <DataTablesPanel refreshKey={historyKey} />
    </PanelShell>
  );
}

export function DockHistoryPanel(_props: IDockviewPanelProps) {
  const { workflowId, historyKey, onSelectExecution } = useEditorDock();
  return (
    <PanelShell>
      <ExecutionHistory
        workflowId={workflowId}
        refreshKey={historyKey}
        onSelectExecution={(rd, meta) => onSelectExecution(rd as ExecutionRunData, meta)}
      />
    </PanelShell>
  );
}

export function DockPropertiesPanel(_props: IDockviewPanelProps) {
  const { runData, onExecutePrevious, isExecuting } = useEditorDock();
  return (
    <PanelShell>
      <PropertiesPanel
        embedded
        runData={runData}
        onExecutePrevious={onExecutePrevious}
        isExecuting={isExecuting}
      />
    </PanelShell>
  );
}

export function DockAssistantPanel(_props: IDockviewPanelProps) {
  const { workflowId } = useEditorDock();
  return (
    <PanelShell>
      <AssistantPanel workflowId={workflowId} />
    </PanelShell>
  );
}

export function DockChatPanel(_props: IDockviewPanelProps) {
  const { workflowId, isExecuting, onExecute } = useEditorDock();
  return (
    <PanelShell>
      <WorkflowChatPanel workflowId={workflowId} isExecuting={isExecuting} onExecute={onExecute} />
    </PanelShell>
  );
}

export const dockComponents = {
  canvas: DockCanvasPanel,
  nodes: DockNodesPanel,
  execution: DockExecutionPanel,
  tables: DockTablesPanel,
  history: DockHistoryPanel,
  properties: DockPropertiesPanel,
  assistant: DockAssistantPanel,
  chat: DockChatPanel,
};
