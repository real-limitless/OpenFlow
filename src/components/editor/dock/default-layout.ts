import type { DockviewApi } from "dockview";
import { EDITOR_PANEL_BY_ID } from "./panel-registry";

/** Build the factory default IDE layout (VS Code–like). */
export function applyDefaultDockLayout(api: DockviewApi): void {
  api.clear();

  const canvasMeta = EDITOR_PANEL_BY_ID.canvas;
  api.addPanel({
    id: canvasMeta.id,
    component: canvasMeta.component,
    title: canvasMeta.title,
  });

  api.addPanel({
    id: "nodes",
    component: "nodes",
    title: EDITOR_PANEL_BY_ID.nodes.title,
    position: { referencePanel: "canvas", direction: "left" },
    initialWidth: 280,
  });

  api.addPanel({
    id: "properties",
    component: "properties",
    title: EDITOR_PANEL_BY_ID.properties.title,
    position: { referencePanel: "canvas", direction: "right" },
    initialWidth: 380,
  });

  api.addPanel({
    id: "assistant",
    component: "assistant",
    title: EDITOR_PANEL_BY_ID.assistant.title,
    position: { referencePanel: "properties", direction: "within" },
    inactive: true,
  });

  api.addPanel({
    id: "execution",
    component: "execution",
    title: EDITOR_PANEL_BY_ID.execution.title,
    position: { referencePanel: "canvas", direction: "below" },
    initialHeight: 260,
  });

  api.addPanel({
    id: "tables",
    component: "tables",
    title: EDITOR_PANEL_BY_ID.tables.title,
    position: { referencePanel: "execution", direction: "within" },
    inactive: true,
  });

  api.addPanel({
    id: "history",
    component: "history",
    title: EDITOR_PANEL_BY_ID.history.title,
    position: { referencePanel: "execution", direction: "within" },
    inactive: true,
  });

  api.getPanel("canvas")?.focus();
}

/** Ensure a panel exists; add next to canvas (or within a preferred sibling). */
export function ensurePanel(
  api: DockviewApi,
  id: keyof typeof EDITOR_PANEL_BY_ID,
  opts?: { focus?: boolean; direction?: "left" | "right" | "above" | "below" | "within"; reference?: string },
): void {
  const existing = api.getPanel(id);
  if (existing) {
    if (opts?.focus !== false) existing.focus();
    return;
  }
  const meta = EDITOR_PANEL_BY_ID[id];
  if (!meta || id === "canvas") return;

  const reference =
    opts?.reference && api.getPanel(opts.reference)
      ? opts.reference
      : api.getPanel("canvas")
        ? "canvas"
        : api.panels[0]?.id;

  api.addPanel({
    id: meta.id,
    component: meta.component,
    title: meta.title,
    position: reference
      ? {
          referencePanel: reference,
          direction: opts?.direction ?? (id === "nodes" ? "left" : id === "properties" || id === "assistant" ? "right" : "below"),
        }
      : undefined,
  });
}
