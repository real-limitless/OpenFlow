import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";

export const Route = createFileRoute("/settings/secret-providers")({
  head: () => ({ meta: [{ title: "Secret providers — OpenFlow" }] }),
  component: SecretProvidersPage,
});

type Provider = {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  config: Record<string, unknown>;
};

function SecretProvidersPage() {
  const [list, setList] = useState<Provider[] | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("vault");
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [endpoint, setEndpoint] = useState("");

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/secret-providers");
    if (!res.ok) {
      setList([]);
      return;
    }
    setList((await res.json()) as Provider[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    let config: Record<string, unknown> = {};
    if (type === "vault") {
      config = { address, token, mount: "secret", kvVersion: 2 };
    } else if (type === "aws-sm") {
      config = {
        region,
        accessKeyId: accessKey || undefined,
        secretAccessKey: secretKey || undefined,
        endpoint: endpoint || undefined,
      };
    }
    const res = await apiFetch("/api/v1/secret-providers", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        type,
        config,
        isDefault: (list?.length ?? 0) === 0,
      }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(b.error ?? "Create failed (admin only when auth is on)");
      return;
    }
    toast.success("Provider created");
    setName("");
    setToken("");
    setSecretKey("");
    await refresh();
  };

  const setDefault = async (id: string) => {
    const res = await apiFetch(`/api/v1/secret-providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isDefault: true }),
    });
    if (!res.ok) {
      toast.error("Failed");
      return;
    }
    await refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this provider?")) return;
    const res = await apiFetch(`/api/v1/secret-providers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(b.error ?? "Delete failed");
      return;
    }
    toast.success("Deleted");
    await refresh();
  };

  return (
    <div>
      <h2 className="text-[15px] font-medium">Secret providers</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        External backends for credentials. Default is local AES encryption. Instance admins only when
        auth is enabled.
      </p>

      <div className="mt-4 space-y-3 rounded-lg border border-border p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prod Vault" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="vault">HashiCorp Vault</option>
              <option value="aws-sm">AWS Secrets Manager</option>
              <option value="local">Local (AES)</option>
            </select>
          </div>
        </div>
        {type === "vault" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="http://vault:8200"
              />
            </div>
            <div className="space-y-1">
              <Label>Token</Label>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="hvs.…"
              />
            </div>
          </div>
        )}
        {type === "aws-sm" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Region</Label>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Endpoint (optional)</Label>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://localstack:4566"
              />
            </div>
            <div className="space-y-1">
              <Label>Access key</Label>
              <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Secret key</Label>
              <Input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
            </div>
          </div>
        )}
        <Button onClick={() => void create()}>Add provider</Button>
      </div>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
        {(list ?? []).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
            <div className="min-w-0 flex-1">
              <span className="font-medium">{p.name}</span>
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">{p.type}</span>
              {p.isDefault && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">default</span>
              )}
            </div>
            {!p.isDefault && (
              <Button size="sm" variant="outline" onClick={() => void setDefault(p.id)}>
                Default
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => void remove(p.id)}
            >
              Delete
            </Button>
          </li>
        ))}
        {list?.length === 0 && (
          <li className="px-4 py-6 text-center text-muted-foreground">
            No providers — credentials use local encryption.
          </li>
        )}
      </ul>
    </div>
  );
}
