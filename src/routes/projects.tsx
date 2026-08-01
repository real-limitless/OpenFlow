import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";
import { setSelectedProjectId, type ProjectSummary } from "@/lib/projects/client";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "Projects — OpenFlow" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/projects");
    if (!res.ok) {
      setList([]);
      return;
    }
    setList((await res.json()) as ProjectSummary[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name: n }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(b.error ?? "Create failed");
        return;
      }
      const p = (await res.json()) as ProjectSummary;
      setName("");
      toast.success("Project created");
      setSelectedProjectId(p.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: ProjectSummary) => {
    if (p.type === "personal") {
      toast.error("Cannot delete personal project");
      return;
    }
    if (!confirm(`Delete project “${p.name}”? Workflows in it will be removed.`)) return;
    const res = await apiFetch(`/api/v1/projects/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(b.error ?? "Delete failed");
      return;
    }
    toast.success("Deleted");
    await refresh();
  };

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <FolderKanban className="size-5" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Organize workflows and credentials. Manage members and roles per project.
          </p>
        </div>
      </div>

      <section className="mt-8 rounded-lg border border-border p-4">
        <h2 className="text-[13px] font-medium">New team project</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor="proj-name" className="sr-only">
              Name
            </Label>
            <Input
              id="proj-name"
              placeholder="Acme ops"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button onClick={() => void create()} disabled={busy}>
            <Plus className="mr-1 size-4" /> Create
          </Button>
        </div>
      </section>

      <section className="mt-8">
        {list === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/projects/$id"
                    params={{ id: p.id }}
                    className="text-[14px] font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {p.type} · your role: {p.role}
                    {"workflowCount" in p
                      ? ` · ${(p as ProjectSummary & { workflowCount?: number }).workflowCount ?? 0} workflows`
                      : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/projects/$id" params={{ id: p.id }}>
                    Open
                  </Link>
                </Button>
                {p.type !== "personal" && (p.role === "owner" || p.role === "admin") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive"
                    onClick={() => void remove(p)}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
