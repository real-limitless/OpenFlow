import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/auth/client";
import type { IWorkflow } from "@/lib/workflow/types";
import {
  collectFolders,
  EMPTY_FILTER,
  matchesOrganization,
  parseSavedViews,
  tagNames,
  workflowFolder,
  type SavedView,
  type WorkflowListFilter,
} from "@/lib/workflow/organization";

const VIEWS_KEY = "openflow.workflow-views.v1";

function loadViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  return parseSavedViews(window.localStorage.getItem(VIEWS_KEY));
}

function persistViews(views: SavedView[]) {
  window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
}

export function useWorkflowOrganization(workflows: IWorkflow[] | null) {
  const [filter, setFilter] = useState<WorkflowListFilter>(EMPTY_FILTER);
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const folders = useMemo(
    () => collectFolders((workflows ?? []).map((wf) => workflowFolder(wf))),
    [workflows],
  );
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const wf of workflows ?? []) {
      for (const tag of tagNames(wf.tags)) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [workflows]);

  const visible = useMemo(
    () => (workflows ?? []).filter((wf) => matchesOrganization(wf, filter)),
    [workflows, filter],
  );

  return {
    filter,
    setFilter,
    views,
    setViews,
    selected,
    setSelected,
    folders,
    allTags,
    visible,
  };
}

export function WorkflowOrganizationBar(props: {
  folders: string[];
  allTags: string[];
  filter: WorkflowListFilter;
  setFilter: (next: WorkflowListFilter) => void;
  views: SavedView[];
  setViews: (next: SavedView[]) => void;
  selectedCount: number;
  onBulkFolder: (folder: string) => void;
  onBulkTag: (tag: string) => void;
}) {
  const [viewName, setViewName] = useState("");
  const [bulkFolder, setBulkFolder] = useState("");
  const [bulkTag, setBulkTag] = useState("");

  const saveView = () => {
    const name = viewName.trim();
    if (!name) return;
    const next = [
      ...props.views,
      { id: `view_${crypto.randomUUID().slice(0, 8)}`, name, filter: props.filter },
    ];
    props.setViews(next);
    persistViews(next);
    setViewName("");
  };

  const removeView = (id: string) => {
    const next = props.views.filter((v) => v.id !== id);
    props.setViews(next);
    persistViews(next);
  };

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <Input
            placeholder="Search workflows"
            value={props.filter.query}
            onChange={(e) => props.setFilter({ ...props.filter, query: e.target.value })}
            aria-label="Search workflows"
          />
        </div>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
          value={props.filter.folder}
          onChange={(e) => props.setFilter({ ...props.filter, folder: e.target.value })}
          aria-label="Folder filter"
        >
          <option value="">All folders</option>
          <option value="__unfiled">Unfiled</option>
          {props.folders.map((folder) => (
            <option key={folder} value={folder}>
              {folder}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
          value={props.filter.active}
          onChange={(e) =>
            props.setFilter({
              ...props.filter,
              active: e.target.value as WorkflowListFilter["active"],
            })
          }
          aria-label="Active filter"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {props.allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {props.allTags.map((tag) => {
            const on = props.filter.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
            return (
              <button
                key={tag}
                type="button"
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
                onClick={() => {
                  const tags = on
                    ? props.filter.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
                    : [...props.filter.tags, tag];
                  props.setFilter({ ...props.filter, tags });
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 max-w-[12rem]"
          placeholder="Save current view as…"
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
        />
        <Button type="button" size="sm" variant="outline" onClick={saveView}>
          Save view
        </Button>
        {props.views.map((view) => (
          <span key={view.id} className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[12px]">
            <button type="button" onClick={() => props.setFilter(view.filter)}>
              {view.name}
            </button>
            <button type="button" className="text-muted-foreground" onClick={() => removeView(view.id)} aria-label={`Delete ${view.name}`}>
              ×
            </button>
          </span>
        ))}
      </div>
      {props.selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">{props.selectedCount} selected</span>
          <Input
            className="h-8 max-w-[10rem]"
            placeholder="Move to folder"
            value={bulkFolder}
            onChange={(e) => setBulkFolder(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              props.onBulkFolder(bulkFolder);
              setBulkFolder("");
            }}
          >
            Move
          </Button>
          <Input
            className="h-8 max-w-[8rem]"
            placeholder="Add tag"
            value={bulkTag}
            onChange={(e) => setBulkTag(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              props.onBulkTag(bulkTag);
              setBulkTag("");
            }}
          >
            Tag
          </Button>
        </div>
      )}
    </div>
  );
}

export function WorkflowOrgRow(props: {
  workflow: IWorkflow;
  selected: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const folder = workflowFolder(props.workflow);
  const tags = tagNames(props.workflow.tags);
  const [editing, setEditing] = useState(false);
  const [folderDraft, setFolderDraft] = useState(folder);
  const [tagsDraft, setTagsDraft] = useState(tags.join(", "));

  useEffect(() => {
    setFolderDraft(folder);
    setTagsDraft(tags.join(", "));
  }, [folder, tags.join("|")]);

  const save = async () => {
    const res = await apiFetch(`/api/v1/workflows/${props.workflow.id}/organization`, {
      method: "PATCH",
      body: JSON.stringify({
        folder: folderDraft,
        tags: tagsDraft.split(/[,\s]+/).filter(Boolean),
      }),
    });
    if (res.ok) {
      setEditing(false);
      props.onChanged();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={props.selected} onChange={props.onToggle} aria-label={`Select ${props.workflow.name}`} />
      {editing ? (
        <div className="flex flex-wrap items-center gap-1">
          <Input className="h-7 w-36" value={folderDraft} onChange={(e) => setFolderDraft(e.target.value)} placeholder="Folder" />
          <Input className="h-7 w-40" value={tagsDraft} onChange={(e) => setTagsDraft(e.target.value)} placeholder="tags" />
          <Button type="button" size="sm" onClick={() => void save()}>
            Save
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="max-w-[16rem] truncate text-left text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
          title="Edit folder and tags"
        >
          {folder || "Unfiled"}
          {tags.length > 0 ? ` · ${tags.join(", ")}` : ""}
        </button>
      )}
    </div>
  );
}

export async function bulkOrganize(ids: string[], patch: { folder?: string; addTags?: string[] }) {
  if (ids.length === 0) return;
  await apiFetch("/api/v1/workflows/organization", {
    method: "POST",
    body: JSON.stringify({ ids, ...patch }),
  });
}
