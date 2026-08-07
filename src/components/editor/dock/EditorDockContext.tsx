import { createContext, useContext, type ReactNode } from "react";
import type { DockviewApi } from "dockview";
import type { ExecutionRunData } from "@/lib/engine/types";

export type EditorDockContextValue = {
  workflowId: string;
  runData: ExecutionRunData | null;
  historyKey: number;
  isExecuting: boolean;
  onExecutePrevious?: (nodeName: string) => void;
  onAddNode: (type: string) => void;
  onSelectExecution: (runData: ExecutionRunData) => void;
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
