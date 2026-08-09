import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NodeIcon } from "./BaseNode";
import { cn } from "@/lib/utils";
import {
  fetchAnsibleCollections,
  fetchAnsibleModules,
  type AnsibleCollectionSummary,
  type AnsibleGalleryHit,
} from "@/lib/nodes/ansible/client";
import { groupGalleryByCollection } from "@/lib/nodes/ansible/catalog-core";
import { ANSIBLE_NODE_TYPE } from "@/lib/nodes/ansible/types";
import type { AddNodeInit } from "@/lib/workflow/add-node";
import { encodeNodeDragPayload, OPENFLOW_NODE_MIME } from "@/lib/workflow/add-node";

const accentAction = "text-[var(--action)] bg-[var(--action)]/12";

function ModuleRow({
  mod,
  onAdd,
}: {
  mod: AnsibleGalleryHit;
  onAdd: (type: string, init?: AddNodeInit) => void;
}) {
  const init: AddNodeInit = {
    name: mod.shortName,
    parameters: { resource: "module", module: mod.fqcn },
  };
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          OPENFLOW_NODE_MIME,
          encodeNodeDragPayload({
            type: ANSIBLE_NODE_TYPE,
            name: mod.shortName,
            parameters: { resource: "module", module: mod.fqcn },
          }),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onAdd(ANSIBLE_NODE_TYPE, init)}
      className="flex w-full items-start gap-2.5 rounded-md border border-transparent p-2 text-left transition hover:border-border hover:bg-surface"
    >
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded", accentAction)}>
        <NodeIcon name="Server" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {mod.shortName}
          </span>
          {mod.hasFormSchema && (
            <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
              form
            </Badge>
          )}
        </span>
        <span className="block font-mono text-[10px] text-muted-foreground/90">{mod.fqcn}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">
          {mod.description}
        </span>
      </span>
    </button>
  );
}

export function AnsiblePaletteSection({
  query,
  forceOpen,
  onAdd,
}: {
  query: string;
  forceOpen?: boolean;
  onAdd: (type: string, init?: AddNodeInit) => void;
}) {
  const q = query.trim();
  const isSearch = q.length > 0;

  const [sectionOpen, setSectionOpen] = useState(true);
  const [collections, setCollections] = useState<AnsibleCollectionSummary[]>([]);
  const [totalModules, setTotalModules] = useState(0);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [openCollections, setOpenCollections] = useState<Record<string, boolean>>({});
  const [modulesByCollection, setModulesByCollection] = useState<
    Record<string, AnsibleGalleryHit[]>
  >({});
  const [loadingCollection, setLoadingCollection] = useState<Record<string, boolean>>({});
  const [searchHits, setSearchHits] = useState<AnsibleGalleryHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load collection index once when section mounts / opens
  useEffect(() => {
    let cancelled = false;
    setCollectionsLoading(true);
    void fetchAnsibleCollections()
      .then((data) => {
        if (cancelled) return;
        setCollections(Array.isArray(data.collections) ? data.collections : []);
        setTotalModules(typeof data.totalModules === "number" ? data.totalModules : 0);
      })
      .catch(() => {
        if (!cancelled) {
          setCollections([]);
          setTotalModules(0);
        }
      })
      .finally(() => {
        if (!cancelled) setCollectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Global search mode
  useEffect(() => {
    if (!isSearch) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setSearchLoading(true);
      void fetchAnsibleModules({ q, limit: 300 })
        .then((data) => {
          if (cancelled) return;
          setSearchHits(Array.isArray(data.items) ? data.items : []);
        })
        .catch(() => {
          if (!cancelled) setSearchHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, isSearch]);

  const loadCollection = useCallback(
    async (name: string) => {
      if (modulesByCollection[name]) return;
      setLoadingCollection((prev) => ({ ...prev, [name]: true }));
      try {
        const data = await fetchAnsibleModules({ collection: name });
        setModulesByCollection((prev) => ({
          ...prev,
          [name]: Array.isArray(data.items) ? data.items : [],
        }));
      } catch {
        setModulesByCollection((prev) => ({ ...prev, [name]: [] }));
      } finally {
        setLoadingCollection((prev) => ({ ...prev, [name]: false }));
      }
    },
    [modulesByCollection],
  );

  const toggleCollection = (name: string) => {
    setOpenCollections((prev) => {
      const nextOpen = !prev[name];
      if (nextOpen) void loadCollection(name);
      return { ...prev, [name]: nextOpen };
    });
  };

  const open = forceOpen || sectionOpen;
  const searchGroups = isSearch ? groupGalleryByCollection(searchHits) : [];
  const badge = isSearch
    ? searchLoading
      ? "…"
      : String(searchHits.length)
    : collectionsLoading
      ? "…"
      : totalModules
        ? totalModules.toLocaleString()
        : String(collections.length);

  // Hide section only if we know catalog is empty after load
  if (!collectionsLoading && collections.length === 0 && !isSearch) {
    return null;
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={(v) => {
        if (!forceOpen) setSectionOpen(v);
      }}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="flex-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Ansible
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
            {badge}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mb-2 space-y-1 pl-1">
          <p className="px-2 text-[10px] text-muted-foreground">
            {isSearch
              ? "Search results across collections"
              : "Browse collection → module (lazy-loaded)"}
          </p>

          {isSearch ? (
            searchLoading ? (
              <p className="px-2 py-2 text-[12px] text-muted-foreground">Searching…</p>
            ) : searchGroups.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-muted-foreground">
                No Ansible modules match.
              </p>
            ) : (
              searchGroups.map((g) => (
                <div key={g.collection}>
                  <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/80">
                    {g.collection}
                    <span className="ml-1 text-muted-foreground">({g.items.length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {g.items.map((mod) => (
                      <ModuleRow key={mod.fqcn} mod={mod as AnsibleGalleryHit} onAdd={onAdd} />
                    ))}
                  </div>
                </div>
              ))
            )
          ) : (
            collections.map((col) => {
              const colOpen = Boolean(openCollections[col.name]);
              const mods = modulesByCollection[col.name];
              const loading = loadingCollection[col.name];
              return (
                <Collapsible
                  key={col.name}
                  open={colOpen}
                  onOpenChange={() => toggleCollection(col.name)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
                    >
                      {colOpen ? (
                        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                        {col.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 shrink-0 px-1 text-[9px] tabular-nums"
                      >
                        {col.moduleCount}
                      </Badge>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mb-1 space-y-0.5 border-l border-border/60 pl-2 ml-2">
                      {loading && (
                        <p className="px-2 py-1 text-[11px] text-muted-foreground">Loading…</p>
                      )}
                      {!loading && mods && mods.length === 0 && (
                        <p className="px-2 py-1 text-[11px] text-muted-foreground">No modules</p>
                      )}
                      {!loading &&
                        mods?.map((mod) => <ModuleRow key={mod.fqcn} mod={mod} onAdd={onAdd} />)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
