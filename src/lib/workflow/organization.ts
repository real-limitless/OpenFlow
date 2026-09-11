export type TagLike = string | { id?: string; name: string };

export type WorkflowListFilter = {
  query: string;
  folder: string;
  tags: string[];
  active: "all" | "active" | "inactive";
};

export type SavedView = {
  id: string;
  name: string;
  filter: WorkflowListFilter;
};

export const EMPTY_FILTER: WorkflowListFilter = {
  query: "",
  folder: "",
  tags: [],
  active: "all",
};

export function normalizeFolder(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

export function tagNames(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const name =
      typeof tag === "string"
        ? tag.trim()
        : tag && typeof tag === "object" && typeof (tag as { name?: unknown }).name === "string"
          ? (tag as { name: string }).name.trim()
          : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function workflowFolder(wf: { folder?: unknown; meta?: unknown }): string {
  if (typeof wf.folder === "string" && wf.folder.trim()) return normalizeFolder(wf.folder);
  const meta = wf.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return normalizeFolder((meta as { folder?: unknown }).folder);
  }
  return "";
}

export function folderAncestors(folder: string): string[] {
  const parts = normalizeFolder(folder).split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

export function collectFolders(folders: string[]): string[] {
  const set = new Set<string>();
  for (const folder of folders) {
    for (const ancestor of folderAncestors(folder)) set.add(ancestor);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export const UNFILED_FOLDER = "__unfiled";

export function inFolder(workflowFolderPath: string, selected: string): boolean {
  if (!selected || selected === "") return true;
  if (selected === UNFILED_FOLDER) return !normalizeFolder(workflowFolderPath);
  const want = normalizeFolder(selected);
  if (!want) return true;
  const have = normalizeFolder(workflowFolderPath);
  return have === want || have.startsWith(`${want}/`);
}

export function matchesOrganization(
  wf: {
    name: string;
    active?: boolean;
    tags?: unknown;
    folder?: unknown;
    meta?: unknown;
  },
  filter: WorkflowListFilter,
): boolean {
  const q = filter.query.trim().toLowerCase();
  if (q && !wf.name.toLowerCase().includes(q)) return false;
  if (filter.active === "active" && !wf.active) return false;
  if (filter.active === "inactive" && wf.active) return false;
  if (!inFolder(workflowFolder(wf), filter.folder)) return false;
  const have = new Set(tagNames(wf.tags).map((t) => t.toLowerCase()));
  for (const tag of filter.tags) {
    if (!have.has(tag.toLowerCase())) return false;
  }
  return true;
}

export function parseSavedViews(raw: string | null | undefined): SavedView[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const filter = (r.filter ?? {}) as Record<string, unknown>;
        const active =
          filter.active === "active" || filter.active === "inactive" ? filter.active : "all";
        return {
          id: typeof r.id === "string" ? r.id : `view_${Math.random().toString(36).slice(2, 10)}`,
          name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Untitled view",
          filter: {
            query: typeof filter.query === "string" ? filter.query : "",
            folder: normalizeFolder(filter.folder),
            tags: tagNames(filter.tags),
            active,
          },
        } satisfies SavedView;
      })
      .filter((v): v is SavedView => v != null);
  } catch {
    return [];
  }
}
