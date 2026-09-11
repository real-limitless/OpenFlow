import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ALL_EVENTS = [
  "execution.started",
  "execution.succeeded",
  "execution.failed",
  "execution.waiting",
  "workflow.updated",
] as const;

type Sub = {
  id: string;
  url: string;
  secret: string;
  secretSet?: boolean;
  events: string[];
  enabled: boolean;
};

type Delivery = {
  at: string;
  event: string;
  url: string;
  ok: boolean;
  status: number | null;
  attempts: number;
  error?: string;
};

export function LifecycleWebhooksPanel() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/settings/lifecycle-webhooks");
    if (!res.ok) return;
    const body = (await res.json()) as { subscriptions: Sub[]; deliveries: Delivery[]; note?: string };
    setSubs(body.subscriptions ?? []);
    setDeliveries(body.deliveries ?? []);
    setNote(body.note ?? "");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    const res = await apiFetch("/api/v1/settings/lifecycle-webhooks", {
      method: "PUT",
      body: JSON.stringify({ subscriptions: subs }),
    });
    if (!res.ok) {
      setMsg("Save failed (admin only when auth is on)");
      return;
    }
    setMsg("Saved");
    await refresh();
  };

  const add = () => {
    setSubs((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        url: "",
        secret: "",
        events: [...ALL_EVENTS],
        enabled: true,
      },
    ]);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Lifecycle webhooks</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{note}</p>
      </div>
      {subs.map((s, idx) => (
        <div key={s.id} className="space-y-2 rounded-md border border-border p-3 text-[13px]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => {
                const next = [...subs];
                next[idx] = { ...s, enabled: e.target.checked };
                setSubs(next);
              }}
            />
            Enabled
          </label>
          <label className="block space-y-1">
            <Label>Endpoint URL</Label>
            <Input
              value={s.url}
              placeholder="https://example.com/openflow-events"
              onChange={(e) => {
                const next = [...subs];
                next[idx] = { ...s, url: e.target.value };
                setSubs(next);
              }}
            />
          </label>
          <label className="block space-y-1">
            <Label>HMAC secret</Label>
            <Input
              type="password"
              value={s.secret}
              placeholder={s.secretSet ? "unchanged" : "shared secret"}
              onChange={(e) => {
                const next = [...subs];
                next[idx] = { ...s, secret: e.target.value };
                setSubs(next);
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((ev) => (
              <label key={ev} className="inline-flex items-center gap-1 text-[12px]">
                <input
                  type="checkbox"
                  checked={s.events.includes(ev)}
                  onChange={(e) => {
                    const events = e.target.checked
                      ? [...s.events, ev]
                      : s.events.filter((x) => x !== ev);
                    const next = [...subs];
                    next[idx] = { ...s, events };
                    setSubs(next);
                  }}
                />
                {ev}
              </label>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSubs(subs.filter((x) => x.id !== s.id))}
          >
            Remove
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={add}>
          Add endpoint
        </Button>
        <Button type="button" size="sm" onClick={() => void save()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
          Reload
        </Button>
      </div>
      {deliveries.length > 0 ? (
        <div>
          <h3 className="text-[13px] font-medium">Recent deliveries</h3>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
            {deliveries.slice(0, 8).map((d, i) => (
              <li key={`${d.at}-${i}`}>
                {d.ok ? "ok" : "fail"} {d.event} → {d.status ?? d.error} ({d.attempts} attempt
                {d.attempts === 1 ? "" : "s"})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {msg ? <p className="text-[12px] text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
