import { useCallback, useEffect, useMemo, useRef } from "react";
import { DockviewReact, type DockviewReadyEvent } from "dockview-react";
import type { DockviewApi, DockviewIDisposable } from "dockview";
import "dockview-react/dist/styles/dockview.css";
import "./dockview-theme.css";

import { useWorkflowStore } from "@/store/workflow-store";
import type { ExecutionRunData } from "@/lib/engine/types";
import { EditorDockProvider, type EditorDockContextValue } from "./EditorDockContext";
import { applyDefaultDockLayout, ensurePanel } from "./default-layout";
import { clearDockLayout, loadDockLayout, saveDockLayout } from "./layout-storage";
import { EDITOR_PANEL_BY_ID, type EditorPanelId } from "./panel-registry";
import { dockComponents } from "./dock-panels";
import { DockTab } from "./DockTab";
import type { AddNodeInit } from "@/lib/workflow/add-node";

export function EditorDockHost({
  workflowId,
  runData,
  historyKey,
  isExecuting,
  onExecutePrevious,
  onAddNode,
  onSelectExecution,
  dockApiRef,
}: {
  workflowId: string;
  runData: ExecutionRunData | null;
  historyKey: number;
  isExecuting: boolean;
  onExecutePrevious?: (nodeName: string) => void;
  onAddNode: (type: string, init?: AddNodeInit) => void;
  onSelectExecution: (runData: ExecutionRunData, meta?: { id: string; status: string }) => void;
  dockApiRef: React.MutableRefObject<DockviewApi | null>;
}) {
  const selected = useWorkflowStore((s) => s.selectedNode);
  const prevSelected = useRef<string | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);
  const disposablesRef = useRef<DockviewIDisposable[]>([]);

  const ctxValue = useMemo<EditorDockContextValue>(
    () => ({
      workflowId,
      runData,
      historyKey,
      isExecuting,
      onExecutePrevious,
      onAddNode,
      onSelectExecution,
      dockApiRef,
    }),
    [
      workflowId,
      runData,
      historyKey,
      isExecuting,
      onExecutePrevious,
      onAddNode,
      onSelectExecution,
      dockApiRef,
    ],
  );

  const scheduleSave = useCallback((api: DockviewApi) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        saveDockLayout(api.toJSON());
      } catch {
        /* ignore */
      }
    }, 250);
  }, []);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api;
      apiRef.current = api;
      dockApiRef.current = api;

      for (const d of disposablesRef.current) d.dispose();
      disposablesRef.current = [];

      const saved = loadDockLayout();
      if (saved) {
        try {
          api.fromJSON(saved);
          if (!api.getPanel("canvas")) {
            applyDefaultDockLayout(api);
          }
        } catch {
          applyDefaultDockLayout(api);
        }
      } else {
        applyDefaultDockLayout(api);
      }

      if (!api.getPanel("canvas")) {
        api.addPanel({
          id: "canvas",
          component: "canvas",
          title: EDITOR_PANEL_BY_ID.canvas.title,
        });
      }

      disposablesRef.current.push(
        api.onDidLayoutChange(() => scheduleSave(api)),
        api.onDidRemovePanel((panel) => {
          if (panel.id === "canvas") {
            queueMicrotask(() => {
              if (!api.getPanel("canvas")) {
                api.addPanel({
                  id: "canvas",
                  component: "canvas",
                  title: EDITOR_PANEL_BY_ID.canvas.title,
                });
              }
            });
          }
          scheduleSave(api);
        }),
      );
    },
    [dockApiRef, scheduleSave],
  );

  useEffect(() => {
    if (selected && selected !== prevSelected.current) {
      const api = apiRef.current;
      if (api) ensurePanel(api, "properties", { focus: true, direction: "right" });
    }
    prevSelected.current = selected;
  }, [selected]);

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      for (const d of disposablesRef.current) d.dispose();
      disposablesRef.current = [];
      dockApiRef.current = null;
      apiRef.current = null;
    };
  }, [dockApiRef]);

  return (
    <EditorDockProvider value={ctxValue}>
      <div className="dockview-theme-openflow h-full min-h-0 w-full min-w-0 flex-1">
        <DockviewReact
          className="h-full w-full"
          components={dockComponents}
          defaultTabComponent={DockTab}
          onReady={onReady}
          disableFloatingGroups={false}
          singleTabMode="fullwidth"
        />
      </div>
    </EditorDockProvider>
  );
}

export function openEditorPanel(api: DockviewApi | null, id: EditorPanelId): void {
  if (!api || id === "canvas") return;
  ensurePanel(api, id, { focus: true });
}

export function resetEditorDockLayout(api: DockviewApi | null): void {
  clearDockLayout();
  if (!api) return;
  applyDefaultDockLayout(api);
  try {
    saveDockLayout(api.toJSON());
  } catch {
    /* ignore */
  }
}

export function floatEditorPanel(api: DockviewApi | null, id: EditorPanelId): void {
  if (!api || id === "canvas") return;
  ensurePanel(api, id, { focus: false });
  const panel = api.getPanel(id);
  if (!panel) return;
  try {
    api.addFloatingGroup(panel, { width: 420, height: 480, x: 80, y: 80 });
  } catch {
    /* already floating */
  }
}

export async function popoutEditorPanel(api: DockviewApi | null, id: EditorPanelId): Promise<void> {
  if (!api || id === "canvas") return;
  ensurePanel(api, id, { focus: false });
  const panel = api.getPanel(id);
  if (!panel) return;
  try {
    await api.addPopoutGroup(panel);
  } catch {
    /* popup blocked */
  }
}
