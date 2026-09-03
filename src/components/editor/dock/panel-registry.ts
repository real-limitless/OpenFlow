export type EditorPanelId =
  | "canvas"
  | "nodes"
  | "execution"
  | "tables"
  | "history"
  | "properties"
  | "assistant"
  | "chat";

export type EditorPanelMeta = {
  id: EditorPanelId;
  /** dockview component key (same as id) */
  component: EditorPanelId;
  title: string;
  /** Can the user close the tab? */
  closable: boolean;
  /** Shown in View menu */
  viewMenu: boolean;
};

export const EDITOR_PANELS: EditorPanelMeta[] = [
  {
    id: "canvas",
    component: "canvas",
    title: "Canvas",
    closable: false,
    viewMenu: false,
  },
  {
    id: "nodes",
    component: "nodes",
    title: "Nodes",
    closable: true,
    viewMenu: true,
  },
  {
    id: "execution",
    component: "execution",
    title: "Execution data",
    closable: true,
    viewMenu: true,
  },
  {
    id: "tables",
    component: "tables",
    title: "Data tables",
    closable: true,
    viewMenu: true,
  },
  {
    id: "history",
    component: "history",
    title: "History",
    closable: true,
    viewMenu: true,
  },
  {
    id: "properties",
    component: "properties",
    title: "Properties",
    closable: true,
    viewMenu: true,
  },
  {
    id: "assistant",
    component: "assistant",
    title: "Assistant",
    closable: true,
    viewMenu: true,
  },
  {
    id: "chat",
    component: "chat",
    title: "Chat",
    closable: true,
    viewMenu: true,
  },
];

export const EDITOR_PANEL_BY_ID = Object.fromEntries(
  EDITOR_PANELS.map((p) => [p.id, p]),
) as Record<EditorPanelId, EditorPanelMeta>;

export const LAYOUT_STORAGE_KEY = "openflow.editor.dock.v1";
