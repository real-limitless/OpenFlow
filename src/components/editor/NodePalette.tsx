import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { allNodeTypes, NODE_CATEGORIES } from "@/lib/nodes/registry";
import type { NodeCategory } from "@/lib/nodes/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NodeIcon, accentFor } from "./BaseNode";
import { cn } from "@/lib/utils";

interface Props {
  onAdd: (type: string) => void;
}

const accentText: Record<string, string> = {
  trigger: "text-[var(--trigger)] bg-[var(--trigger)]/12",
  logic: "text-[var(--logic)] bg-[var(--logic)]/12",
  action: "text-[var(--action)] bg-[var(--action)]/12",
  placeholder: "text-[var(--placeholder)] bg-[var(--placeholder)]/12",
};

/**
 * Only the core building blocks start expanded. With 24 categories the domain
 * groups have to open collapsed or the palette is unusable on first render.
 * Typed as Record<NodeCategory, …> so a newly added category must be given a
 * default here rather than silently defaulting to closed.
 */
const DEFAULT_OPEN: Record<NodeCategory, boolean> = {
  Triggers: true,
  Actions: true,
  Flow: false,
  Transform: false,
  Helpers: false,
  Canvas: true,
  AI: false,
  "AI Tool": false,
  Communication: false,
  "Data & Storage": false,
  Database: false,
  Development: false,
  Files: false,
  Productivity: false,
  Marketing: false,
  Sales: false,
  CRM: false,
  "Finance & Accounting": false,
  Payments: false,
  Analytics: false,
  App: false,
  Core: false,
  Utility: false,
  Miscellaneous: false,
};

export function NodePalette({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(DEFAULT_OPEN);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = allNodeTypes().filter(
      (d) =>
        !q ||
        d.displayName.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
    return NODE_CATEGORIES.map((category) => ({
      category,
      items: matches.filter((d) => d.category === category),
    })).filter((g) => g.items.length);
  }, [query]);

  const isSearching = query.trim().length > 0;

  useEffect(() => {
    if (!isSearching) return;
    setOpenCategories((prev) => {
      const next = { ...prev };
      for (const g of grouped) next[g.category] = true;
      return next;
    });
  }, [isSearching, grouped]);

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes"
            className="h-9 bg-background pl-8 text-sm"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-1 p-2">
          {grouped.map((group) => {
            const isOpen = isSearching || (openCategories[group.category] ?? false);
            return (
              <Collapsible
                key={group.category}
                open={isOpen}
                onOpenChange={() => {
                  if (!isSearching) toggleCategory(group.category);
                }}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {group.category}
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
                      {group.items.length}
                    </Badge>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mb-2 space-y-0.5 pl-1">
                    {group.items.map((d) => {
                      const accent = accentFor(d.group, d.placeholder);
                      return (
                        <button
                          key={d.name}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/openflow-node", d.name);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => onAdd(d.name)}
                          className="flex w-full items-start gap-2.5 rounded-md border border-transparent p-2 text-left transition hover:border-border hover:bg-surface"
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid size-7 shrink-0 place-items-center rounded",
                              accentText[accent],
                            )}
                          >
                            <NodeIcon name={d.icon} className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-foreground">
                              {d.displayName}
                            </span>
                            <span className="block text-[11px] leading-snug text-muted-foreground">
                              {d.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {!grouped.length && (
            <p className="px-2 py-4 text-sm text-muted-foreground">No nodes match “{query}”.</p>
          )}
        </div>
      </div>

      <p className="border-t border-border p-3 text-[11px] leading-snug text-muted-foreground">
        Drag onto the canvas, or click to place. Unsupported imported types keep their parameters as
        placeholder nodes.
      </p>
    </aside>
  );
}
