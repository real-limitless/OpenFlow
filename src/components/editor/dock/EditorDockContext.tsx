import { createContext, useContext, type ReactNode } from "react";
import type { DockviewApi } from "dockview";
import type { ExecutionRunData } from "@/lib/engine/types";
import type { AddNodeInit } from "@/lib/workflow/add-node";
import type { INodeExecutionData } from "@/lib/workflow/types";

export type EditorDockContextValue = {
  workflowId: string;
  runData: ExecutionRunData | null;
  historyKey: number;
  isExecuting: boolean;
  onExecutePrevious?: (nodeName: string) => void;
  onExecute?: (
    startNode?: string,
    opts?: { pinData?: Record<string, INodeExecutionData[]> },
  ) => Promise<ExecutionRunData | null | void>;
  onAddNode: (type: string, init?: AddNodeInit) => void;
  onSelectExecution: (runData: ExecutionRunData, meta?: { id: string; status: string }) => void;
  /** Live dockview API after ready (for View menu / focus). */
  dockApiRef: React.MutableRefObject<DockviewApi | null>;
};

const EditorDockContext = createContext<EditorDockContextValue | null>(null);

export function EditorDockProvider({
  value,
  children,
}: {
  value: EditorDockContextValue;
  children: ReactNode;
}) {
  return <EditorDockContext.Provider value={value}>{children}</EditorDockContext.Provider>;
}

export function useEditorDock(): EditorDockContextValue {
  const ctx = useContext(EditorDockContext);
  if (!ctx) throw new Error("useEditorDock must be used within EditorDockProvider");
  return ctx;
}

export function useEditorDockOptional(): EditorDockContextValue | null {
  return useContext(EditorDockContext);
}
