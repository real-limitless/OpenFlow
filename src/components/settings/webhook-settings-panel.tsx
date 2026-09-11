import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";

type WebhookSettings = {
  required: boolean;
  requiredOverride: boolean | null;
  mode: "header" | "basic" | "signed";
  hasSecret: boolean;
  envSecretConfigured: boolean;
  tryOut: boolean;
  idempotency?: { header: string; alternateHeader: string; windowSec: number };
};

type RouteRow = {
  id: string;
  path: string;
  method: string;
  hasWorkflowSecret: boolean;
  workflow: { id: string; name: string };
};

export function WebhookSettingsPanel() {
  const [cfg, setCfg] = useState<WebhookSettings | null>(null);
  const [secret, setSecret] = useState("");
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [routeSecrets, setRouteSecrets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [settingsRes, routesRes] = await Promise.all([
      apiFetch("/api/v1/settings/webhooks"),
      apiFetch("/api/v1/webhooks"),
    ]);
    if (settingsRes.ok) setCfg((await settingsRes.json()) as WebhookSettings);
    if (routesRes.ok) setRoutes((await routesRes.json()) as RouteRow[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/v1/settings/webhooks", {
        method: "PUT",
        body: JSON.stringify({
          required: cfg.required,
          mode: cfg.mode,
          secret: secret || undefined,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(b.error ?? "Save failed");
        return;
      }
      setCfg((await res.json()) as WebhookSettings);
      setSecret("");
      toast.success("Webhook auth saved");
    } finally {
      setSaving(false);
    }
  };

  const saveRouteSecret = async (id: string) => {
    const value = routeSecrets[id] ?? "";
    const res = await apiFetch(`/api/v1/webhooks/${id}/secret`, {
      method: "PUT",
      body: JSON.stringify({ secret: value }),
    });
    if (!res.ok) {
      toast.error("Could not save workflow secret");
      return;
    }
    toast.success("Workflow webhook secret saved");
    setRouteSecrets((prev) => ({ ...prev, [id]: "" }));
    void refresh();
  };

  if (!cfg) {
    return <p className="text-[13px] text-muted-foreground">Loading webhook settings…</p>;
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Webhook authentication</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Incoming <code className="rounded bg-muted px-1">/webhook/:path</code> calls require a
          shared secret when this is on. Send header{" "}
          <code className="rounded bg-muted px-1">X-OpenFlow-Webhook-Secret</code>, HTTP basic, or
          HMAC SHA-256. Missing or wrong secrets return 401.
        </p>
        {cfg.tryOut && (
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
            Try-out mode defaults this off. Production (AUTH_DISABLED=false) defaults it on.
          </p>
        )}
        {cfg.idempotency && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Duplicate POSTs with the same{" "}
            <code className="rounded bg-muted px-1">{cfg.idempotency.header}</code> (or{" "}
            <code className="rounded bg-muted px-1">{cfg.idempotency.alternateHeader}</code>)
            return the original execution for {cfg.idempotency.windowSec}s.
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={cfg.required}
          onChange={(e) => setCfg({ ...cfg, required: e.target.checked })}
        />
        Require webhook authentication
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="wh-mode">Mode</Label>
        <select
          id="wh-mode"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={cfg.mode}
          onChange={(e) =>
            setCfg({ ...cfg, mode: e.target.value as WebhookSettings["mode"] })
          }
        >
          <option value="header">Header secret</option>
          <option value="basic">HTTP basic</option>
          <option value="signed">HMAC SHA-256</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wh-secret">
          Instance secret {cfg.hasSecret ? "(set)" : "(not set)"}
        </Label>
        <Input
          id="wh-secret"
          type="password"
          autoComplete="new-password"
          placeholder={cfg.hasSecret ? "Leave blank to keep current" : "Shared secret"}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
      </div>
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save webhook auth"}
      </Button>

      {routes.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-[13px] font-medium">Per-workflow secrets</h3>
          {routes.map((r) => (
            <div key={r.id} className="space-y-1.5">
              <p className="text-[12px] text-muted-foreground">
                {r.workflow.name} · /webhook/{r.path} · {r.method}
                {r.hasWorkflowSecret ? " · secret set" : ""}
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Workflow secret"
                  value={routeSecrets[r.id] ?? ""}
                  onChange={(e) =>
                    setRouteSecrets((prev) => ({ ...prev, [r.id]: e.target.value }))
                  }
                />
                <Button
                  variant="outline"
                  onClick={() => void saveRouteSecret(r.id)}
                  disabled={!(routeSecrets[r.id] ?? "").length}
                >
                  Set
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
