import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Sparkles } from "lucide-react";
import { allNodeTypes, NODE_CATEGORIES } from "@/lib/nodes/registry";
import type { INodeTypeDescription, NodeCategory } from "@/lib/nodes/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NodeIcon, accentFor } from "./BaseNode";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth/client";

interface Props {
  onAdd: (type: string) => void;
}

const accentText: Record<string, string> = {
  trigger: "text-[var(--trigger)] bg-[var(--trigger)]/12",
  logic: "text-[var(--logic)] bg-[var(--logic)]/12",
  action: "text-[var(--action)] bg-[var(--action)]/12",
  placeholder: "text-[var(--placeholder)] bg-[var(--placeholder)]/12",
};

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

type SuggestItem = {
  type: string;
  displayName: string;
  description: string;
  category: string;
  rankTier?: string;
  score?: number;
  isShell?: boolean;
};

function looksLikeIntent(q: string): boolean {
  const t = q.trim();
  if (t.length < 8) return false;
  if (/\s/.test(t)) return true;
  return t.length >= 16;
}

export function NodePalette({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(DEFAULT_OPEN);
  const [semantic, setSemantic] = useState<SuggestItem[] | null>(null);
  const [semanticMode, setSemanticMode] = useState<string | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = allNodeTypes().filter((d) => {
      if (!q) return true;
      const hay = [d.displayName, d.description, d.name, d.category]
        .filter((s): s is string => typeof s === "string")
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
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

  useEffect(() => {
    const q = query.trim();
    if (!looksLikeIntent(q)) {
      setSemantic(null);
      setSemanticMode(null);
      setSemanticLoading(false);
      return;
    }
    let cancelled = false;
    setSemanticLoading(true);
    const t = window.setTimeout(() => {
      void apiFetch("/api/v1/catalog/suggest-nodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: q, limit: 12 }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json() as Promise<{
            mode?: string;
            items?: SuggestItem[];
            note?: string;
            indexed?: boolean;
          }>;
        })
        .then((data) => {
          if (cancelled) return;
          const items = Array.isArray(data.items) ? data.items : [];
          setSemantic(items);
          // Treat empty keyword-only cold start as unavailable for badge clarity
          if (items.length === 0 && data.mode === "keyword" && data.indexed === false) {
            setSemanticMode(null);
          } else {
            setSemanticMode(data.mode ?? (items.length ? "hybrid" : null));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSemantic(null);
            setSemanticMode(null);
          }
        })
        .finally(() => {
          if (!cancelled) setSemanticLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const typeByName = useMemo(() => {
    const m = new Map<string, INodeTypeDescription>();
    for (const d of allNodeTypes()) m.set(d.name, d);
    return m;
  }, []);

  return (
    <aside className="flex h-full w-full min-w-0 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or describe a task…"
            className="h-9 bg-background pl-8 text-sm"
          />
        </div>
        {looksLikeIntent(query) && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Sparkles className="size-3" />
            {semanticLoading
              ? "Semantic catalog…"
              : semanticMode
                ? `Semantic (${semanticMode}) — domain nodes ranked above shell`
                : "Semantic unavailable — keyword results below"}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {semantic && semantic.length > 0 && (
          <div className="space-y-0.5 border-b border-border p-2">
            <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Suggested
            </div>
            {semantic.map((it) => {
              const d = typeByName.get(it.type);
              const accent = accentFor(d?.group, d?.placeholder);
              return (
                <button
                  key={`sem-${it.type}`}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/openflow-node", it.type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onAdd(it.type)}
                  className="flex w-full items-start gap-2.5 rounded-md border border-transparent p-2 text-left transition hover:border-border hover:bg-surface"
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded",
                      accentText[accent],
                    )}
                  >
                    <NodeIcon name={d?.icon ?? "Box"} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {it.displayName}
                      </span>
                      {it.rankTier && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-4 shrink-0 px-1 text-[9px]",
                            it.isShell && "border-amber-500/40 text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {it.rankTier}
                        </Badge>
                      )}
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {it.description || it.type}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

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
