import { useEffect, useState } from "react";
import type { IDockviewPanelHeaderProps } from "dockview";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EDITOR_PANEL_BY_ID, type EditorPanelId } from "./panel-registry";

export function DockTab({ api }: IDockviewPanelHeaderProps) {
  const [title, setTitle] = useState(api.title);
  const meta = EDITOR_PANEL_BY_ID[api.id as EditorPanelId];
  const closable = meta ? meta.closable : api.id !== "canvas";

  useEffect(() => {
    const sub = api.onDidTitleChange((e) => setTitle(e.title));
    if (title !== api.title) setTitle(api.title);
    return () => sub.dispose();
  }, [api, title]);

  return (
    <div
      className={cn(
        "of-dock-tab group flex h-full max-w-[12rem] min-w-0 items-center gap-1 px-2.5",
        "select-none text-[11px] font-medium tracking-tight",
      )}
      data-panel-id={api.id}
    >
      <span className="min-w-0 flex-1 truncate text-inherit" title={title ?? undefined}>
        {title}
      </span>
      {closable && (
        <button
          type="button"
          className={cn(
            "of-dock-tab-close grid size-4 shrink-0 place-items-center rounded-sm",
            "text-muted-foreground/70 opacity-0 transition-opacity",
            "hover:bg-accent hover:text-foreground",
            "group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none",
            "[[data-active=true]_&]:opacity-60",
          )}
          aria-label={`Close ${title ?? "panel"}`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            api.close();
          }}
        >
          <X className="size-3" strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
