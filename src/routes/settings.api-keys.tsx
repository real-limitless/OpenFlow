import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/auth/client";

export const Route = createFileRoute("/settings/api-keys")({
  head: () => ({ meta: [{ title: "API keys — OpenFlow" }] }),
  component: ApiKeysPage,
});

type Grant = {
  id?: string;
  workflowId: string;
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
  expiresAt: string | null;
};

type KeyRow = {
  id: string;
  name: string;
  scopes: string[];
  restrictWorkflows: boolean;
  canCreateWorkflows: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  grants: Grant[];
};

type WfOption = { id: string; name: string };

const CLASSIC_SCOPES = ["openflow:read", "openflow:write", "openflow:execute"] as const;
const OPT_IN_SCOPES = [
  { id: "openflow:credentials", label: "Manage credentials (create/update/delete secrets)" },
  { id: "openflow:variables", label: "Manage variables (incl. secret vars)" },
] as const;
const ALL_SCOPES = [...CLASSIC_SCOPES, ...OPT_IN_SCOPES.map((s) => s.id)] as const;

function ApiKeysPage() {
  const [list, setList] = useState<KeyRow[] | null>(null);
  const [workflows, setWorkflows] = useState<WfOption[]>([]);
  const [name, setName] = useState("");
  const [restrict, setRestrict] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [scopes, setScopes] = useState<string[]>([...CLASSIC_SCOPES]);
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedWf, setSelectedWf] = useState<Record<string, { w: boolean; x: boolean }>>({});
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/api-keys");
    if (!res.ok) {
      setList([]);
      return;
    }
    setList((await res.json()) as KeyRow[]);
  }, []);

  const loadWorkflows = useCallback(async () => {
    const res = await apiFetch("/api/v1/workflows");
    if (!res.ok) return;
    const body = (await res.json()) as { id: string; name: string }[];
    setWorkflows(body.map((w) => ({ id: w.id, name: w.name })));
  }, []);

  useEffect(() => {
    void refresh();
    void loadWorkflows();
  }, [refresh, loadWorkflows]);

  const toggleScope = (s: string) => {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const create = async () => {
    if (!name.trim()) return;
    const grants = Object.entries(selectedWf).map(([workflowId, p]) => ({
      workflowId,
      canRead: true,
      canWrite: p.w,
      canExecute: p.x,
    }));
    const res = await apiFetch("/api/v1/api-keys", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        scopes,
        restrictWorkflows: restrict,
        canCreateWorkflows: canCreate,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        grants: restrict ? grants : [],
      }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(b.error ?? "Create failed");
      return;
    }
    const body = (await res.json()) as { key: string };
    setCreatedRaw(body.key);
    setName("");
    setSelectedWf({});
    toast.success("API key created — copy it now");
    await refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Revoke this API key?")) return;
    const res = await apiFetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Revoked");
    await refresh();
  };

  return (
    <div>
      <h2 className="text-[15px] font-medium">API keys</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Machine access for REST and MCP. Use{" "}
        <code className="rounded bg-muted px-1">Authorization: Bearer of_…</code>. Restricted keys
        only see granted workflows. See{" "}
        <Link to="/settings/mcp" className="text-primary hover:underline">
          MCP settings
        </Link>
        .
      </p>

      {createdRaw && (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[13px]">
          <p className="font-medium">Copy this key — it won’t be shown again:</p>
          <code className="mt-1 block break-all font-mono text-[12px]">{createdRaw}</code>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard.writeText(createdRaw);
              toast.success("Copied");
            }}
          >
            Copy
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-4 rounded-lg border border-border p-4">
        <p className="text-[13px] font-medium">Create key</p>
        <div className="space-y-1">
          <Label htmlFor="key-name">Name</Label>
          <Input
            id="key-name"
            placeholder="Claude MCP"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[12px]">Scopes</Label>
          <div className="flex flex-wrap gap-3 text-[12px]">
            {CLASSIC_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() => toggleScope(s)}
                />
                <code>{s}</code>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Opt-in secret management (off by default — agents never receive decrypted values back):
          </p>
          <div className="flex flex-col gap-2 text-[12px]">
            {OPT_IN_SCOPES.map((s) => (
              <label key={s.id} className="flex items-start gap-1.5">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={scopes.includes(s.id)}
                  onChange={() => toggleScope(s.id)}
                />
                <span>
                  <code>{s.id}</code>
                  <span className="ml-1 text-muted-foreground">— {s.label}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Restrict to selected workflows</Label>
            <p className="text-[11px] text-muted-foreground">
              Off = full access to all your workflows (legacy). On = secure default.
            </p>
          </div>
          <Switch checked={restrict} onCheckedChange={setRestrict} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Allow create workflow</Label>
            <p className="text-[11px] text-muted-foreground">Only when restricted.</p>
          </div>
          <Switch checked={canCreate} onCheckedChange={setCanCreate} disabled={!restrict} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="key-exp">Expires (optional)</Label>
          <Input
            id="key-exp"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        {restrict && (
          <div className="space-y-2">
            <Label className="text-[12px]">Workflow grants</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {workflows.length === 0 && (
                <p className="text-[12px] text-muted-foreground">No workflows yet.</p>
              )}
              {workflows.map((w) => {
                const on = selectedWf[w.id];
                return (
                  <div
                    key={w.id}
                    className="flex flex-wrap items-center gap-2 text-[12px] py-1 border-b border-border/50 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(on)}
                      onChange={(e) => {
                        setSelectedWf((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) next[w.id] = { w: true, x: true };
                          else delete next[w.id];
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    {on && (
                      <>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={on.w}
                            onChange={(e) =>
                              setSelectedWf((p) => ({
                                ...p,
                                [w.id]: { ...p[w.id], w: e.target.checked },
                              }))
                            }
                          />
                          edit
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={on.x}
                            onChange={(e) =>
                              setSelectedWf((p) => ({
                                ...p,
                                [w.id]: { ...p[w.id], x: e.target.checked },
                              }))
                            }
                          />
                          run
                        </label>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button onClick={() => void create()}>Create</Button>
      </div>

      <ul className="mt-6 divide-y divide-border rounded-md border border-border">
        {list === null && (
          <li className="px-4 py-6 text-center text-muted-foreground">Loading…</li>
        )}
        {list?.length === 0 && (
          <li className="px-4 py-6 text-center text-muted-foreground">No API keys yet.</li>
        )}
        {list?.map((k) => (
          <li key={k.id} className="px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{k.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {k.restrictWorkflows
                    ? `${k.grants.length} workflow grant(s)`
                    : "Unrestricted (all workflows)"}
                  {k.expiresAt ? ` · expires ${new Date(k.expiresAt).toLocaleString()}` : ""}
                  {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : ""}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {(k.scopes ?? []).join(" ")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded(expanded === k.id ? null : k.id)}
                >
                  {expanded === k.id ? "Hide" : "Grants"}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void remove(k.id)}>
                  Revoke
                </Button>
              </div>
            </div>
            {expanded === k.id && (
              <ul className="mt-2 space-y-1 rounded bg-muted/40 p-2 text-[11px]">
                {!k.restrictWorkflows && <li>Full access — not restricted</li>}
                {k.restrictWorkflows && k.grants.length === 0 && (
                  <li className="text-amber-700 dark:text-amber-400">
                    No grants — this key cannot open any workflow
                  </li>
                )}
                {k.grants.map((g) => (
                  <li key={g.workflowId}>
                    <code>{g.workflowId}</code> — r{g.canWrite ? "w" : ""}
                    {g.canExecute ? "x" : ""}
                    {g.expiresAt ? ` · until ${new Date(g.expiresAt).toLocaleString()}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
