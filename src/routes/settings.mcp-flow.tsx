import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteMcpFlowConnection,
  fetchMcpFlowBackends,
  fetchMcpFlowConnection,
  fetchMcpFlowProjects,
  fetchMcpFlowStatus,
  saveMcpFlowConnection,
} from "@/lib/nodes/mcp-flow/client";
import type {
  McpFlowBackend,
  McpFlowConnectionPublic,
  McpFlowProject,
} from "@/lib/nodes/mcp-flow/types";

export const Route = createFileRoute("/settings/mcp-flow")({
  head: () => ({ meta: [{ title: "mcp-flow — OpenFlow" }] }),
  component: McpFlowSettingsPage,
});

function McpFlowSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState<McpFlowConnectionPublic | null>(null);
  const [url, setUrl] = useState("http://127.0.0.1:8787");
  const [apiKey, setApiKey] = useState("");
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<McpFlowProject[]>([]);
  const [backends, setBackends] = useState<McpFlowBackend[]>([]);
  const [statusNote, setStatusNote] = useState("");
  const [busyList, setBusyList] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const conn = await fetchMcpFlowConnection();
      if (conn.connected && conn.credential) {
        setConnected(conn.credential);
        setUrl(conn.credential.url);
      } else {
        setConnected(null);
        setBackends([]);
        setProjects([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load mcp-flow connection");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async (credentialId: string, projectSlug?: string) => {
    setBusyList(true);
    try {
      const [proj, listed, status] = await Promise.allSettled([
        fetchMcpFlowProjects({ credentialId }),
        fetchMcpFlowBackends({ credentialId, project: projectSlug || undefined }),
        fetchMcpFlowStatus({ credentialId, project: projectSlug || undefined }),
      ]);
      if (proj.status === "fulfilled") setProjects(proj.value.items ?? []);
      else setProjects([]);
      if (listed.status === "fulfilled") setBackends(listed.value.items ?? []);
      else {
        setBackends([]);
        toast.error(
          listed.reason instanceof Error ? listed.reason.message : "Could not list backends",
        );
      }
      if (status.status === "fulfilled") {
        setStatusNote("Gateway reachable");
      } else {
        setStatusNote(status.reason instanceof Error ? status.reason.message : "Status failed");
      }
    } finally {
      setBusyList(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (connected?.id) void loadCatalog(connected.id, project || undefined);
  }, [connected?.id, project, loadCatalog]);

  const connect = async () => {
    setSaving(true);
    try {
      const saved = await saveMcpFlowConnection({ url, apiKey });
      setConnected(saved);
      setApiKey("");
      toast.success("mcp-flow connected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!connected) return;
    setBusyList(true);
    try {
      await fetchMcpFlowStatus({
        credentialId: connected.id,
        project: project || undefined,
      });
      setStatusNote("Gateway reachable");
      toast.success("mcp-flow gateway responded to mf_status");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Status failed";
      setStatusNote(message);
      toast.error(message);
    } finally {
      setBusyList(false);
    }
  };

  const disconnect = async () => {
    if (!connected) return;
    if (!confirm("Disconnect this mcp-flow API key?")) return;
    setSaving(true);
    try {
      await deleteMcpFlowConnection(connected.id);
      setConnected(null);
      setBackends([]);
      setProjects([]);
      setApiKey("");
      toast.success("Disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[15px] font-medium">mcp-flow gateway</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Connect an mcp-flow agent API key so AI Agent tools can pick backends from your gateway
          catalog. This is separate from{" "}
          <Link to="/settings/mcp" className="text-primary hover:underline">
            OpenFlow as an MCP server
          </Link>
          .
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">Connection</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {connected
                ? `Connected as ${connected.name} (${connected.url})`
                : "Not connected — paste gateway URL and mf_… key"}
            </p>
            {statusNote && connected && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">{statusNote}</p>
            )}
          </div>
          {connected && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={saving || busyList}
                onClick={() => void testConnection()}
              >
                Test
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void disconnect()}
              >
                Disconnect
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[13px]">Gateway URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8787"
              className="h-9 text-[13px]"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[13px]">Agent API key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={connected ? "Paste a new key to replace" : "mf_…"}
              className="h-9 text-[13px] font-mono"
              autoComplete="off"
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={saving || !url.trim() || !apiKey.trim()}
          onClick={() => void connect()}
        >
          {connected ? "Replace key" : "Connect"}
        </Button>
      </section>

      {connected && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium">Backends</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Catalog from mf_list_backends. Use these as the MCP Client Tool backend option for
                AI Agents.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busyList}
              onClick={() => connected && void loadCatalog(connected.id, project || undefined)}
            >
              {busyList ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {projects.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[13px]">Project</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-[13px]"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">Active / default</option>
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title || p.slug}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Slug</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Transport</th>
                  <th className="px-3 py-2 font-medium">Placement</th>
                  <th className="px-3 py-2 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {backends.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                      {busyList ? "Loading backends…" : "No backends on this project."}
                    </td>
                  </tr>
                )}
                {backends.map((b) => (
                  <tr key={b.slug} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-mono text-[12px]">{b.slug}</td>
                    <td className="px-3 py-2">{b.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{b.transport ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{b.placement ?? "—"}</td>
                    <td className="px-3 py-2">{b.enabled === false ? "no" : "yes"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
