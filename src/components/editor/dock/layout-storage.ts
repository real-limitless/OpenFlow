import type { SerializedDockview } from "dockview";
import { LAYOUT_STORAGE_KEY } from "./panel-registry";

export function loadDockLayout(): SerializedDockview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SerializedDockview;
  } catch {
    return null;
  }
}

export function saveDockLayout(layout: SerializedDockview): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* quota / private mode */
  }
}

export function clearDockLayout(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
