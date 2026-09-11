import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Payload = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  secretSet: boolean;
  redirectUri: string;
  jitProvisioning: boolean;
  loginEnabled: boolean;
  suggestedRedirect?: string;
  envConfigured?: boolean;
  note?: string;
};

export function SsoOidcPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/settings/sso");
    if (!res.ok) return;
    const body = (await res.json()) as Payload;
    setData(body);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!data) return;
    const res = await apiFetch("/api/v1/settings/sso", {
      method: "PUT",
      body: JSON.stringify({
        enabled: data.enabled,
        issuer: data.issuer,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        redirectUri: data.redirectUri,
        jitProvisioning: data.jitProvisioning,
      }),
    });
    if (!res.ok) {
      setMsg("Save failed (admin only when auth is on)");
      return;
    }
    const body = (await res.json()) as Payload;
    setData({ ...data, ...body, note: data.note });
    setMsg("Saved");
  };

  if (!data) {
    return <p className="text-[13px] text-muted-foreground">Loading SSO…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">SSO (OIDC)</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{data.note}</p>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={data.enabled}
          onChange={(e) => setData({ ...data, enabled: e.target.checked })}
        />
        Enable OIDC login
      </label>
      <label className="space-y-1 text-[13px]">
        <Label>Issuer</Label>
        <Input
          value={data.issuer}
          placeholder="https://login.example.com/realms/openflow"
          onChange={(e) => setData({ ...data, issuer: e.target.value })}
        />
      </label>
      <label className="space-y-1 text-[13px]">
        <Label>Client ID</Label>
        <Input
          value={data.clientId}
          onChange={(e) => setData({ ...data, clientId: e.target.value })}
        />
      </label>
      <label className="space-y-1 text-[13px]">
        <Label>Client secret</Label>
        <Input
          type="password"
          value={data.clientSecret}
          placeholder={data.secretSet ? "unchanged" : ""}
          onChange={(e) => setData({ ...data, clientSecret: e.target.value })}
        />
      </label>
      <label className="space-y-1 text-[13px]">
        <Label>Redirect URI</Label>
        <Input
          value={data.redirectUri}
          placeholder={data.suggestedRedirect}
          onChange={(e) => setData({ ...data, redirectUri: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={data.jitProvisioning}
          onChange={(e) => setData({ ...data, jitProvisioning: e.target.checked })}
        />
        JIT-provision members from the IdP (first user is still owner)
      </label>
      <p className="text-[12px] text-muted-foreground">
        Sign-in button: {data.loginEnabled ? "on" : "off"}
        {data.envConfigured ? " · env OPENFLOW_OIDC_* is set" : ""}
      </p>
      <Button type="button" size="sm" onClick={() => void save()}>
        Save SSO
      </Button>
      {msg ? <p className="text-[12px] text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
