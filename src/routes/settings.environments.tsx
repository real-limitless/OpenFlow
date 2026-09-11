import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";
import { getSelectedProjectId } from "@/lib/projects/client";
import type { EnvironmentSummary } from "@/lib/environments/client";

export const Route = createFileRoute("/settings/environments")({
  head: () => ({ meta: [{ title: "Environments — OpenFlow" }] }),
  component: EnvironmentsSettingsPage,
});

function EnvironmentsSettingsPage() {
  const [list, setList] = useState<EnvironmentSummary[] | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const refresh = useCallback(async () => {
    const pid = getSelectedProjectId();
    const q = pid ? `?projectId=${encodeURIComponent(pid)}` : "";
    const res = await apiFetch(`/api/v1/environments${q}`);
    if (!res.ok) {
      setList([]);
      return;
    }
    setList((await res.json()) as EnvironmentSummary[]);
  }, []);

  useEffect(() => {
    void refresh();
    const onScope = () => void refresh();
    window.addEventListener("openflow:scope-change", onScope);
    return () => window.removeEventListener("openflow:scope-change", onScope);
  }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    const res = await apiFetch("/api/v1/environments", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim() || undefined,
        projectId: getSelectedProjectId(),
      }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(b.error ?? "Create failed");
      return;
    }
    setName("");
    setSlug("");
    toast.success("Environment created");
    await refresh();
  };

  const setDefault = async (id: string) => {
    const res = await apiFetch(`/api/v1/environments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isDefault: true }),
    });
    if (!res.ok) {
      toast.error("Could not set default");
      return;
    }
    toast.success("Default updated");
    await refresh();
  };

  const remove = async (e: EnvironmentSummary) => {
    if (e.isDefault) {
      toast.error("Cannot delete default environment");
      return;
    }
    if (!confirm(`Delete environment “${e.name}”?`)) return;
    const res = await apiFetch(`/api/v1/environments/${e.id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(b.error ?? "Delete failed");
      return;
    }
    toast.success("Deleted");
    await refresh();
  };

  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([]);
  const [credentials, setCredentials] = useState<Array<{ id: string; name: string }>>([]);
  const [promoteWf, setPromoteWf] = useState("");
  const [promoteEnv, setPromoteEnv] = useState("");
  const [overrideCred, setOverrideCred] = useState("");
  const [overrideEnv, setOverrideEnv] = useState("");
  const [overrideJson, setOverrideJson] = useState("{}");

  useEffect(() => {
    void apiFetch("/api/v1/workflows").then(async (res) => {
      if (!res.ok) return;
      const rows = (await res.json()) as Array<{ id: string; name: string }>;
      setWorkflows(rows);
      if (rows[0]) setPromoteWf(rows[0].id);
    });
    void apiFetch("/api/v1/credentials").then(async (res) => {
      if (!res.ok) return;
      const rows = (await res.json()) as Array<{ id: string; name: string }>;
      setCredentials(rows);
      if (rows[0]) setOverrideCred(rows[0].id);
    });
  }, []);

  useEffect(() => {
    if (list?.[0] && !promoteEnv) setPromoteEnv(list[0].id);
    if (list?.[0] && !overrideEnv) setOverrideEnv(list[0].id);
  }, [list, promoteEnv, overrideEnv]);

  return (
    <div>
      <h2 className="text-[15px] font-medium">Environments</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        For the project selected in the header. Variable overrides can target each env.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="QA" />
        </div>
        <div className="space-y-1">
          <Label>Slug (optional)</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="qa" />
        </div>
        <Button className="mt-6" onClick={() => void create()}>
          Add
        </Button>
      </div>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
        {(list ?? []).map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
            <div className="min-w-0 flex-1">
              <span className="font-medium">{e.name}</span>
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">{e.slug}</span>
              {e.isDefault && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">default</span>
              )}
            </div>
            {!e.isDefault && (
              <Button size="sm" variant="outline" onClick={() => void setDefault(e.id)}>
                Make default
              </Button>
            )}
            {!e.isDefault && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => void remove(e)}
              >
                Delete
              </Button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-8 space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-[14px] font-medium">Promote workflow</h3>
        <p className="text-[13px] text-muted-foreground">
          Snapshots the graph, records an audit event, and marks the destination environment
          active. Promoting to production requires an instance admin.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            value={promoteWf}
            onChange={(e) => setPromoteWf(e.target.value)}
            aria-label="Workflow to promote"
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            value={promoteEnv}
            onChange={(e) => setPromoteEnv(e.target.value)}
            aria-label="Target environment"
          >
            {(list ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={() => {
              void apiFetch(`/api/v1/workflows/${promoteWf}/promote`, {
                method: "POST",
                body: JSON.stringify({ toEnvironmentId: promoteEnv }),
              }).then(async (res) => {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) toast.error(body.error ?? "Promote failed");
                else toast.success("Promoted");
              });
            }}
          >
            Promote
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-[14px] font-medium">Credential overrides</h3>
        <p className="text-[13px] text-muted-foreground">
          Per-environment secret payload (JSON). Executions in that env use the override instead of
          the base credential.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            value={overrideCred}
            onChange={(e) => setOverrideCred(e.target.value)}
            aria-label="Credential"
          >
            {credentials.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            value={overrideEnv}
            onChange={(e) => setOverrideEnv(e.target.value)}
            aria-label="Override environment"
          >
            {(list ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-border bg-background p-2 font-mono text-[12px]"
          value={overrideJson}
          onChange={(e) => setOverrideJson(e.target.value)}
          aria-label="Override JSON"
        />
        <Button
          type="button"
          onClick={() => {
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(overrideJson) as Record<string, unknown>;
            } catch {
              toast.error("Invalid JSON");
              return;
            }
            void apiFetch(`/api/v1/credentials/${overrideCred}/env-overrides/${overrideEnv}`, {
              method: "PUT",
              body: JSON.stringify({ data }),
            }).then(async (res) => {
              if (!res.ok) toast.error("Override failed");
              else toast.success("Override saved");
            });
          }}
        >
          Save override
        </Button>
      </div>
    </div>
  );
}
