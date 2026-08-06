import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";

export const Route = createFileRoute("/settings/templates")({
  head: () => ({ meta: [{ title: "Template libraries — OpenFlow" }] }),
  component: TemplateLibrariesPage,
});

type SourceRow = {
  id: string;
  name: string;
  url?: string;
  dir?: string;
  ref: string;
  enabled: boolean;
  priority: number;
  templateCount: number;
  isDefault: boolean;
};

type Status = {
  templateCount: number;
  lastSyncedAt: string | null;
  defaultSource: { id: string; name: string; url?: string };
  sync: {
    running: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
    lastResult: {
      totals: { processed: number; inserted: number; updated: number; errors: number };
      finishedAt: string;
    } | null;
  };
};

function TemplateLibrariesPage() {
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState("main");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [srcRes, stRes] = await Promise.all([
      apiFetch("/api/v1/template-sources"),
      apiFetch("/api/v1/template-sources/status"),
    ]);
    if (srcRes.ok) {
      const body = (await srcRes.json()) as { sources: SourceRow[] };
      setSources(body.sources);
    } else {
      setSources([]);
    }
    if (stRes.ok) {
      setStatus((await stRes.json()) as Status);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status?.sync.running) return;
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [status?.sync.running, refresh]);

  const addSource = async () => {
    if (!url.trim()) {
      toast.error("Git repository URL is required");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/v1/template-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          name: name.trim() || undefined,
          ref: ref.trim() || "main",
          sync: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        syncStarted?: boolean;
      };
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      toast.success(
        body.syncStarted
          ? "Library added — sync started in the background"
          : "Library added",
      );
      setUrl("");
      setName("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add library");
    } finally {
      setBusy(false);
    }
  };

  const syncAll = async (sourceId?: string) => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/v1/template-sources/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        toast.message("Sync already running");
      } else if (!res.ok) {
        throw new Error(body.error ?? `Sync failed (${res.status})`);
      } else {
        toast.success(
          sourceId
            ? `Syncing ${sourceId}…`
            : "Syncing all enabled libraries…",
        );
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = async (id: string, enabled: boolean) => {
    const res = await apiFetch(`/api/v1/template-sources/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Update failed");
      return;
    }
    toast.success(enabled ? "Enabled" : "Disabled");
    await refresh();
  };

  const removeSource = async (s: SourceRow) => {
    if (s.isDefault) {
      await setEnabled(s.id, false);
      return;
    }
    if (!confirm(`Remove library “${s.name}” from config?`)) return;
    const prune = confirm("Also delete its templates from the database?");
    const res = await apiFetch(
      `/api/v1/template-sources/${encodeURIComponent(s.id)}${prune ? "?prune=1" : ""}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Remove failed");
      return;
    }
    toast.success("Removed");
    await refresh();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Template libraries</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The marketplace loads workflows from one or more git repos. Default:{" "}
          <a
            href="https://github.com/real-limitless/n8n-workflow-library"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            real-limitless/n8n-workflow-library
          </a>
          . Add more anytime after setup.
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          In database:{" "}
          <strong className="text-foreground">
            {status?.templateCount?.toLocaleString() ?? "—"}
          </strong>{" "}
          templates
          {status?.lastSyncedAt
            ? ` · last sync ${new Date(status.lastSyncedAt).toLocaleString()}`
            : ""}
          {status?.sync.running ? " · sync running…" : ""}
          {status?.sync.error ? (
            <span className="text-destructive"> · {status.sync.error}</span>
          ) : null}
        </p>
        {status?.sync.lastResult && !status.sync.running && (
          <p className="mt-1 text-[12px] text-muted-foreground">
            Last job: processed {status.sync.lastResult.totals.processed}, inserted{" "}
            {status.sync.lastResult.totals.inserted}, updated{" "}
            {status.sync.lastResult.totals.updated}, errors{" "}
            {status.sync.lastResult.totals.errors}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || status?.sync.running}
          onClick={() => void syncAll()}
        >
          {status?.sync.running ? "Syncing…" : "Sync all enabled"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || status?.sync.running}
          onClick={() => void syncAll("n8n-community")}
        >
          Sync default library
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/templates">Open marketplace</Link>
        </Button>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Add a library</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Repo must contain <code className="text-[11px]">workflows/&#123;id&#125;/workflow.json</code>{" "}
          (same layout as n8n-workflow-library). Sync starts automatically after add.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tpl-url">Git URL</Label>
            <Input
              id="tpl-url"
              placeholder="https://github.com/org/my-openflow-templates.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Display name (optional)</Label>
            <Input
              id="tpl-name"
              placeholder="My team templates"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-ref">Branch / tag</Label>
            <Input
              id="tpl-ref"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          className="mt-3"
          disabled={busy || !url.trim()}
          onClick={() => void addSource()}
        >
          Add library &amp; sync
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Configured sources</h3>
        {sources === null ? (
          <p className="mt-2 text-[13px] text-muted-foreground">Loading…</p>
        ) : sources.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">No sources configured.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[13px]">{s.name}</span>
                    {s.isDefault && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        default
                      </span>
                    )}
                    {!s.enabled && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        disabled
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {s.url || s.dir} · {s.ref} · {s.templateCount.toLocaleString()} templates
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy || status?.sync.running || !s.enabled}
                    onClick={() => void syncAll(s.id)}
                  >
                    Sync
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setEnabled(s.id, !s.enabled)}
                  >
                    {s.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void removeSource(s)}
                  >
                    {s.isDefault ? "Disable default" : "Remove"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
