import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/auth/client";

export const Route = createFileRoute("/settings/mcp")({
  head: () => ({ meta: [{ title: "MCP — OpenFlow" }] }),
  component: McpSettingsPage,
});

type McpSettingsResponse = {
  enabled: boolean;
  enabledOverride: boolean | null;
  envDisabled: boolean;
  canManage: boolean;
  authDisabled: boolean;
  publicUrl: string;
  mcpUrl: string;
  oauthMetadataUrl: string;
  oauthResourceUrl: string;
  scopes: string[];
  tools: { name: string; description: string }[];
};

type TempToken = {
  id: string;
  name: string | null;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  grants: {
    workflowId: string;
    canRead: boolean;
    canWrite: boolean;
    canExecute: boolean;
    expiresAt: string | null;
  }[];
};

function McpSettingsPage() {
  const [data, setData] = useState<McpSettingsResponse | null>(null);
  const [tokens, setTokens] = useState<TempToken[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/settings/mcp");
      if (!res.ok) {
        toast.error("Failed to load MCP settings");
        return;
      }
      setData((await res.json()) as McpSettingsResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTokens = useCallback(async () => {
    const res = await apiFetch("/api/v1/mcp-access-tokens");
    if (!res.ok) {
      setTokens([]);
      return;
    }
    setTokens((await res.json()) as TempToken[]);
  }, []);

  useEffect(() => {
    void refresh();
    void refreshTokens();
  }, [refresh, refreshTokens]);

  const clientSnippet = useMemo(() => {
    if (!data?.mcpUrl) return "";
    return JSON.stringify(
      {
        mcpServers: {
          openflow: {
            url: data.mcpUrl,
          },
        },
      },
      null,
      2,
    );
  }, [data?.mcpUrl]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const setEnabled = async (enabled: boolean) => {
    if (!data?.canManage || data.envDisabled) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/v1/settings/mcp", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(b.error ?? "Save failed");
        return;
      }
      setData((await res.json()) as McpSettingsResponse);
      toast.success(enabled ? "MCP enabled" : "MCP disabled");
    } finally {
      setSaving(false);
    }
  };

  const revokeToken = async (id: string) => {
    if (!confirm("Revoke this temporary MCP token?")) return;
    const res = await apiFetch(`/api/v1/mcp-access-tokens/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      toast.error("Revoke failed");
      return;
    }
    toast.success("Token revoked");
    await refreshTokens();
  };

  if (loading && !data) {
    return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  }
  if (!data) {
    return <p className="text-[13px] text-muted-foreground">Could not load MCP settings.</p>;
  }

  const activeTemps = (tokens ?? []).filter(
    (t) => !t.revokedAt && new Date(t.expiresAt).getTime() > Date.now(),
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[15px] font-medium">MCP server</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Connect third-party chatbots (Claude, Cursor, ChatGPT, …) so they can build and run
          workflows with the same tools as the editor assistant.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">Status</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {data.authDisabled
                ? "Auth disabled (local) — no OAuth required"
                : "Auth on — OAuth 2.1, API key (of_…), or temp token (oft_…)"}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
              data.enabled
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {data.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="space-y-0.5">
            <Label htmlFor="mcp-enabled" className="text-[13px]">
              Enable remote MCP
            </Label>
            <p className="text-[12px] text-muted-foreground">
              {data.envDisabled
                ? "Forced off by OPENFLOW_MCP_ENABLED=false in the environment."
                : data.canManage
                  ? "Instance admins can toggle this. Env kill-switch still wins if set."
                  : "Only instance owners/admins can change this."}
            </p>
          </div>
          <Switch
            id="mcp-enabled"
            checked={data.enabled}
            disabled={!data.canManage || data.envDisabled || saving}
            onCheckedChange={(v) => void setEnabled(v)}
          />
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h3 className="text-[14px] font-medium">Access control</h3>
        <p className="text-[12px] text-muted-foreground">
          External agents only see the intersection of your user permissions, OAuth/API scopes, and
          per-workflow grants (read / edit / run) with optional expiry.
        </p>
        <ul className="list-inside list-disc space-y-1 text-[12px] text-muted-foreground">
          <li>
            <Link to="/settings/api-keys" className="text-primary hover:underline">
              API keys
            </Link>{" "}
            — long-lived <code className="rounded bg-muted px-1">of_…</code> with workflow allowlist
          </li>
          <li>
            Workflow editor → <strong>⋯ → Share with AI (MCP)</strong> — temporary{" "}
            <code className="rounded bg-muted px-1">oft_…</code> for one workflow
          </li>
          <li>OAuth browser login — pick workflows on the consent screen</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-[14px] font-medium">Connect</h3>
        <CopyRow label="MCP URL" value={data.mcpUrl} onCopy={copy} />
        <CopyRow label="OAuth metadata" value={data.oauthMetadataUrl} onCopy={copy} />
        <CopyRow label="Protected resource" value={data.oauthResourceUrl} onCopy={copy} />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[13px]">Client config (Cursor / Claude Desktop)</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[12px]"
              onClick={() => void copy(clientSnippet, "Config")}
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {clientSnippet}
          </pre>
          <p className="text-[12px] text-muted-foreground">
            Paste the URL into your MCP client. With auth enabled, complete the browser OAuth
            prompt (select workflows), or use an{" "}
            <Link to="/settings/api-keys" className="text-primary hover:underline">
              API key
            </Link>{" "}
            / temporary token (
            <code className="rounded bg-muted px-1">Authorization: Bearer of_…</code> or{" "}
            <code className="rounded bg-muted px-1">oft_…</code>).
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-medium">Temporary tokens</h3>
          <Button type="button" size="sm" variant="ghost" onClick={() => void refreshTokens()}>
            Refresh
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Created from the workflow editor (Share with AI). Revoke anytime.
        </p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {tokens === null && (
            <li className="px-3 py-4 text-center text-[12px] text-muted-foreground">Loading…</li>
          )}
          {tokens?.length === 0 && (
            <li className="px-3 py-4 text-center text-[12px] text-muted-foreground">
              No temporary tokens yet.
            </li>
          )}
          {tokens?.map((t) => {
            const expired = new Date(t.expiresAt).getTime() <= Date.now();
            const revoked = Boolean(t.revokedAt);
            const status = revoked ? "Revoked" : expired ? "Expired" : "Active";
            return (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0 text-[12px]">
                  <p className="font-medium">{t.name || t.id}</p>
                  <p className="text-muted-foreground">
                    {status}
                    {" · "}expires {new Date(t.expiresAt).toLocaleString()}
                    {t.lastUsedAt
                      ? ` · last used ${new Date(t.lastUsedAt).toLocaleString()}`
                      : ""}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {t.grants
                      .map(
                        (g) =>
                          `${g.workflowId.slice(0, 8)}… r${g.canWrite ? "w" : ""}${g.canExecute ? "x" : ""}`,
                      )
                      .join(", ") || "no grants"}
                  </p>
                </div>
                {!revoked && !expired && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void revokeToken(t.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {activeTemps.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{activeTemps.length} active</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[14px] font-medium">OAuth scopes</h3>
        <ul className="list-inside list-disc text-[13px] text-muted-foreground">
          {data.scopes.map((s) => (
            <li key={s}>
              <code className="rounded bg-muted px-1 text-[12px] text-foreground">{s}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-[14px] font-medium">Tools</h3>
        <p className="text-[12px] text-muted-foreground">
          Same surface as the editor assistant (catalog, canvas edit, execute). Filtered by grants.
        </p>
        <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-border p-3">
          {data.tools.map((t) => (
            <li key={t.name} className="text-[12px]">
              <code className="font-mono text-foreground">{t.name}</code>
              <span className="text-muted-foreground"> — {t.description}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[12px] text-muted-foreground">
        Set <code className="rounded bg-muted px-1">OPENFLOW_PUBLIC_URL</code> when behind a reverse
        proxy so OAuth issuer URLs match your public host. Full reference:{" "}
        <code className="rounded bg-muted px-1">docs/mcp.md</code> in the repo.
      </p>
    </div>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (text: string, label: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[12px]">
          {value}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1"
          onClick={() => void onCopy(value, label)}
        >
          <Copy className="size-3.5" />
          Copy
        </Button>
      </div>
    </div>
  );
}
