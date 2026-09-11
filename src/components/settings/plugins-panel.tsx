import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type CatalogItem = {
  id: string;
  publisher: string;
  version: string;
  displayName: string;
  types: string[];
  enabled: boolean;
};

type Payload = {
  allowPublishers: string[];
  enabledIds: string[];
  catalog: CatalogItem[];
  note?: string;
};

export function PluginsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [publishers, setPublishers] = useState("");
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/settings/plugins");
    if (!res.ok) return;
    const body = (await res.json()) as Payload;
    setData(body);
    setPublishers((body.allowPublishers ?? []).join("\n"));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (enabledIds: string[], allowPublishers?: string[]) => {
    const res = await apiFetch("/api/v1/settings/plugins", {
      method: "PUT",
      body: JSON.stringify({
        enabledIds,
        allowPublishers: allowPublishers ?? publishers.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean),
      }),
    });
    if (!res.ok) {
      setMsg("Save failed (admin only when auth is on)");
      return;
    }
    const body = (await res.json()) as Payload;
    setData({ ...body, note: data?.note });
    setPublishers((body.allowPublishers ?? []).join("\n"));
    setMsg("Saved");
    await refresh();
  };

  if (!data) {
    return <p className="text-[13px] text-muted-foreground">Loading plugins…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Plugins</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{data.note}</p>
      </div>
      <label className="space-y-1 text-[13px]">
        <Label>Publisher allowlist</Label>
        <textarea
          className="min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[12px]"
          value={publishers}
          onChange={(e) => setPublishers(e.target.value)}
        />
      </label>
      <ul className="space-y-2 text-[13px]">
        {data.catalog.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <span>
              <span className="font-medium text-foreground">{p.displayName}</span>{" "}
              <span className="text-muted-foreground">
                {p.id} · {p.publisher} · {p.types.join(", ")}
              </span>
            </span>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...data.enabledIds, p.id]
                    : data.enabledIds.filter((id) => id !== p.id);
                  void save(next);
                }}
              />
              Enabled
            </label>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        onClick={() => void save(data.enabledIds, publishers.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean))}
      >
        Save allowlist
      </Button>
      {msg ? <p className="text-[12px] text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
