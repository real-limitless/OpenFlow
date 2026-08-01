import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Braces, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/layout/page-shell";
import { apiFetch } from "@/lib/auth/client";
import { getSelectedProjectId } from "@/lib/projects/client";

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
  secret: boolean;
  environmentId?: string | null;
};

function VariablesPage() {
  const [list, setList] = useState<VariableRow[] | null>(null);
  const [layer, setLayer] = useState<"base" | "env">("base");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [secret, setSecret] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const q = new URLSearchParams({ scope: "project", layer });
      const res = await apiFetch(`/api/v1/variables?${q}`);
      if (!res.ok) throw new Error("load failed");
      setList((await res.json()) as VariableRow[]);
    } catch {
      toast.error("Could not load variables");
      setList([]);
    }
  }, [layer]);

  useEffect(() => {
    void refresh();
    const onScope = () => void refresh();
    window.addEventListener("openflow:scope-change", onScope);
    return () => window.removeEventListener("openflow:scope-change", onScope);
  }, [refresh]);

  const parseValue = (raw: string): unknown => {
    try {
      return raw.trim() === "" ? "" : JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const save = async () => {
    const k = key.trim();
    if (!k) {
      toast.error("Key required");
      return;
    }
    setBusy(true);
    try {
      if (editId) {
        const res = await apiFetch(`/api/v1/variables/${editId}`, {
          method: "PUT",
          body: JSON.stringify({
            key: k,
            value: parseValue(value),
            secret,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(body.error ?? "Update failed");
          return;
        }
        toast.success("Updated");
      } else {
        const res = await apiFetch("/api/v1/variables", {
          method: "POST",
          body: JSON.stringify({
            key: k,
            value: parseValue(value),
            scope: "project",
            projectId: getSelectedProjectId() ?? undefined,
            environmentId: layer === "env" ? undefined : null,
            secret,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(body.error ?? "Create failed");
          return;
        }
        toast.success("Variable created");
      }
      setKey("");
      setValue("");
      setSecret(false);
      setEditId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row: VariableRow) => {
    setEditId(row.id);
    setKey(row.key);
    setValue(row.secret ? "" : typeof row.value === "string" ? row.value : JSON.stringify(row.value));
    setSecret(row.secret);
  };

  const remove = async (row: VariableRow) => {
    if (!confirm(`Delete $vars.${row.key}?`)) return;
    const res = await apiFetch(`/api/v1/variables/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Deleted");
    if (editId === row.id) {
      setEditId(null);
      setKey("");
      setValue("");
    }
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
    <PageShell maxWidth="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Braces className="size-5" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Variables</h1>
          </div>
          <p className="mt-2 max-w-xl text-[14px] text-[14px] text-muted-foreground">
            Available in expressions as{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{"{{ $vars.key }}"}</code>.
            Scope follows the project/environment in the header.
          </p>
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={layer}
          onChange={(e) => setLayer(e.target.value as "base" | "env")}
        >
          <option value="base">Base (all envs)</option>
          <option value="env">Env override</option>
        </select>
      </div>

      <section className="mt-8 rounded-lg border border-border p-4">
        <h2 className="text-[13px] font-medium">{editId ? "Edit variable" : "Add variable"}</h2>
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
          <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
          Secret (encrypt at rest, redact in UI)
        </label>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void save()} disabled={busy}>
            <Plus className="mr-1 size-4" /> {editId ? "Update" : "Add"}
          </Button>
          {editId && (
            <Button
              variant="outline"
              onClick={() => {
                setEditId(null);
                setKey("");
                setValue("");
                setSecret(false);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </section>

      <section className="mt-8">
        {list === null ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-[14px] text-muted-foreground">
            No variables in this layer yet.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {list.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[14px] font-medium">
                    $vars.{row.key}
                    {row.secret ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] font-normal text-muted-foreground">
                        secret
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[12px] text-muted-foreground">
                    {displayValue(row.value)}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="size-8" onClick={() => startEdit(row)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => void remove(row)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
