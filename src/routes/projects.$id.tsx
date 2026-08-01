import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";
import { setSelectedProjectId } from "@/lib/projects/client";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "Project — OpenFlow" }] }),
  component: ProjectDetailPage,
});

type Member = {
  id: string;
  userId: string;
  email: string;
  role: string;
};

type ProjectDetail = {
  id: string;
  name: string;
  type: string;
  role: string;
  members: Member[];
  workflowCount: number;
  credentialCount: number;
};

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [name, setName] = useState("");

  const refresh = useCallback(async () => {
    const res = await apiFetch(`/api/v1/projects/${id}`);
    if (!res.ok) {
      setProject(null);
      return;
    }
    const p = (await res.json()) as ProjectDetail;
    setProject(p);
    setName(p.name);
    setSelectedProjectId(p.id);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canAdmin = project?.role === "owner" || project?.role === "admin";

  const saveName = async () => {
    if (!canAdmin || !name.trim()) return;
    const res = await apiFetch(`/api/v1/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      toast.error("Rename failed");
      return;
    }
    toast.success("Renamed");
    await refresh();
  };

  const addMember = async () => {
    if (!email.trim()) return;
    const res = await apiFetch(`/api/v1/projects/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), role }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(b.error ?? "Could not add member");
      return;
    }
    setEmail("");
    toast.success("Member added");
    await refresh();
  };

  const changeRole = async (memberId: string, next: string) => {
    const res = await apiFetch(`/api/v1/projects/${id}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: next }),
    });
    if (!res.ok) {
      toast.error("Role update failed");
      return;
    }
    await refresh();
  };

  const removeMember = async (memberId: string) => {
    if (!confirm("Remove this member?")) return;
    const res = await apiFetch(`/api/v1/projects/${id}/members/${memberId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Remove failed");
      return;
    }
    toast.success("Removed");
    await refresh();
  };

  if (!project) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Project not found or loading…</p>
        <Link to="/projects" className="mt-4 text-sm text-primary hover:underline">
          Back to projects
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Link to="/projects" className="text-[13px] text-muted-foreground hover:text-foreground">
        ← Projects
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{project.name}</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {project.type} · your role: {project.role} · {project.workflowCount} workflows ·{" "}
        {project.credentialCount} credentials
      </p>

      {canAdmin && (
        <section className="mt-8 rounded-lg border border-border p-4">
          <h2 className="text-[13px] font-medium">Rename</h2>
          <div className="mt-2 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="outline" onClick={() => void saveName()}>
              Save
            </Button>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[15px] font-medium">Members</h2>
        {canAdmin && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="mem-email">Email</Label>
              <Input
                id="mem-email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <Button onClick={() => void addMember()}>Add</Button>
          </div>
        )}
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {project.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="min-w-0 flex-1 truncate">{m.email}</span>
              {canAdmin && m.role !== "owner" ? (
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-[12px]"
                  value={m.role}
                  onChange={(e) => void changeRole(m.id, e.target.value)}
                >
                  <option value="viewer">viewer</option>
                  <option value="editor">editor</option>
                  <option value="admin">admin</option>
                </select>
              ) : (
                <span className="text-muted-foreground">{m.role}</span>
              )}
              {canAdmin && m.role !== "owner" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={() => void removeMember(m.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
