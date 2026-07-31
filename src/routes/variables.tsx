import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Braces, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchProjects,
  getSelectedProjectId,
  projectHeaders,
  setSelectedProjectId,
  type ProjectSummary,
} from "@/lib/projects/client";
import {
  fetchEnvironments,
  getSelectedEnvironmentId,
  setSelectedEnvironmentId,
  type EnvironmentSummary,
} from "@/lib/environments/client";

export const Route = createFileRoute("/variables")({
  head: () => ({
    meta: [
      { title: "Variables — OpenFlow" },
      {
        name: "description",
        content: "Manage custom variables available as $vars in expressions.",
      },
    ],
  }),
  component: VariablesPage,
});

type VariableRow = {
  id: string;
  key: string;
  value: unknown;
  scope: string;
  projectId: string | null;
  environmentId?: string | null;
  secret: boolean;
  createdAt: string;
  updatedAt: string;
};

function VariablesPage() {
  const [list, setList] = useState<VariableRow[] | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(getSelectedProjectId());
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState<string | null>(getSelectedEnvironmentId());
  const [layer, setLayer] = useState<"base" | "env">("base");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [secret, setSecret] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const q = new URLSearchParams({ scope: "project", layer });
      const res = await fetch(`/api/v1/variables?${q}`, {
        headers: projectHeaders(),
      });
      if (!res.ok) throw new Error("load failed");
      setList((await res.json()) as VariableRow[]);
    } catch {
      toast.error("Could not load variables");
      setList([]);
    }
  }, [layer]);

  useEffect(() => {
    void fetchProjects().then((p) => {
      setProjects(p);
      const stored = getSelectedProjectId();
      const next =
        (stored && p.find((x) => x.id === stored)?.id) ||
        p.find((x) => x.type === "personal")?.id ||
        p[0]?.id ||
        null;
      setProjectId(next);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void fetchEnvironments(projectId).then((list) => {
      setEnvironments(list);
      const stored = getSelectedEnvironmentId();
      const next =
        (stored && list.find((e) => e.id === stored)?.id) ||
        list.find((e) => e.isDefault)?.id ||
        list[0]?.id ||
        null;
      setSelectedEnvironmentId(next);
      setEnvironmentId(next);
    });
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh, projectId, environmentId, layer]);

  const create = async () => {
    const k = key.trim();
    if (!k) {
      toast.error("Key required");
      return;
    }
    let parsed: unknown = value;
    try {
      parsed = value.trim() === "" ? "" : JSON.parse(value);
    } catch {
      parsed = value;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/variables", {
        method: "POST",
        headers: projectHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          key: k,
          value: parsed,
          scope: "project",
          projectId: projectId ?? undefined,
          environmentId: layer === "env" ? environmentId : null,
          secret,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Create failed");
        return;
      }
      toast.success("Variable created");
      setKey("");
      setValue("");
      setSecret(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: VariableRow) => {
    if (!confirm(`Delete $${row.key}?`)) return;
    const res = await fetch(`/api/v1/variables/${row.id}`, {
      method: "DELETE",
      headers: projectHeaders(),
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Deleted");
    await refresh();
  };

  const displayValue = (v: unknown) => {
    if (typeof v === "string") return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-14">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to workflows
      </Link>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Braces className="size-5" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Variables</h1>
          </div>
          <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
            Project variables are available in expressions as{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{"{{ $vars.key }}"}</code>.
            Secret values are encrypted and never shown after save.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {projects.length > 0 && (
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={projectId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setProjectId(id);
                setSelectedProjectId(id);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {environments.length > 0 && (
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={environmentId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setEnvironmentId(id);
                setSelectedEnvironmentId(id);
              }}
            >
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={layer}
            onChange={(e) => setLayer(e.target.value as "base" | "env")}
          >
            <option value="base">Base (all envs)</option>
            <option value="env">Env override</option>
          </select>
        </div>
      </div>

      <section className="mt-8 rounded-lg border border-border p-4">
        <h2 className="text-[13px] font-medium">Add variable</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="var-key">Key</Label>
            <Input
              id="var-key"
              placeholder="apiUrl"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="font-mono text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="var-value">Value</Label>
            <Input
              id="var-value"
              placeholder="https://api.example.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type={secret ? "password" : "text"}
            />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={secret}
            onChange={(e) => setSecret(e.target.checked)}
          />
          Secret (encrypt at rest, redact in UI)
        </label>
        <Button className="mt-3" onClick={() => void create()} disabled={busy}>
          <Plus className="mr-1 size-4" /> Add
        </Button>
      </section>

      <section className="mt-8">
        {list === null ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-[14px] text-muted-foreground">
            No project variables yet.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {list.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[14px] font-medium">
                    $vars.{row.key}
                    {row.secret ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-sans font-normal text-muted-foreground">
                        secret
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[12px] text-muted-foreground">
                    {displayValue(row.value)}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => void remove(row)}
                  aria-label="Delete"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
