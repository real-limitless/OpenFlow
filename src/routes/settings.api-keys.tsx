import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";

export const Route = createFileRoute("/settings/api-keys")({
  head: () => ({ meta: [{ title: "API keys — OpenFlow" }] }),
  component: ApiKeysPage,
});

type KeyRow = { id: string; name: string; scopes: string; createdAt: string };

function ApiKeysPage() {
  const [list, setList] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/api-keys");
    if (!res.ok) {
      setList([]);
      return;
    }
    setList((await res.json()) as KeyRow[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    const res = await apiFetch("/api/v1/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      toast.error("Create failed");
      return;
    }
    const body = (await res.json()) as { key: string };
    setCreatedRaw(body.key);
    setName("");
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
        Use header <code className="rounded bg-muted px-1">X-API-Key: of_…</code> for REST access.
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

      <div className="mt-4 flex gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="key-name">Name</Label>
          <Input
            id="key-name"
            placeholder="CI deploy"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button className="mt-6" onClick={() => void create()}>
          Create
        </Button>
      </div>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
        {(list ?? []).map((k) => (
          <li key={k.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <span className="min-w-0 flex-1 font-medium">{k.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {k.createdAt ? new Date(k.createdAt).toLocaleString() : ""}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => void remove(k.id)}
            >
              Revoke
            </Button>
          </li>
        ))}
        {list?.length === 0 && (
          <li className="px-4 py-6 text-center text-muted-foreground">No API keys yet.</li>
        )}
      </ul>
    </div>
  );
}
