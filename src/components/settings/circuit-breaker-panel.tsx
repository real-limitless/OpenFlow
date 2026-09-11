import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Breaker = {
  key: string;
  kind: string;
  state: string;
  failures: number;
  lastStatus: number | null;
  cooldownRemainingMs: number;
};

type Payload = {
  enabled: boolean;
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxCalls: number;
  ignoreHosts: string[];
  breakers: Breaker[];
  note?: string;
};

export function CircuitBreakerPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [ignoreText, setIgnoreText] = useState("");
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/settings/circuit-breakers");
    if (!res.ok) return;
    const body = (await res.json()) as Payload;
    setData(body);
    setIgnoreText((body.ignoreHosts ?? []).join("\n"));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!data) return;
    const ignoreHosts = ignoreText
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await apiFetch("/api/v1/settings/circuit-breakers", {
      method: "PUT",
      body: JSON.stringify({
        enabled: data.enabled,
        failureThreshold: data.failureThreshold,
        cooldownMs: data.cooldownMs,
        halfOpenMaxCalls: data.halfOpenMaxCalls,
        ignoreHosts,
      }),
    });
    if (!res.ok) {
      setMsg("Save failed (admin only when auth is on)");
      return;
    }
    const body = (await res.json()) as Payload;
    setData(body);
    setIgnoreText((body.ignoreHosts ?? []).join("\n"));
    setMsg("Saved");
  };

  const reset = async (key?: string) => {
    const res = await apiFetch("/api/v1/settings/circuit-breakers/reset", {
      method: "POST",
      body: JSON.stringify(key ? { key } : {}),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setMsg(res.ok ? (key ? `Reset ${key}` : "Reset all breakers") : body.error ?? "Reset failed");
    await refresh();
  };

  if (!data) {
    return <p className="text-[13px] text-muted-foreground">Loading circuit breakers…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Circuit breakers</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{data.note}</p>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={data.enabled}
          onChange={(e) => setData({ ...data, enabled: e.target.checked })}
        />
        Enable host/credential breakers on HTTP Request
      </label>
      <div className="grid gap-3 sm:grid-cols-3 text-[13px]">
        <label className="space-y-1">
          <Label>Failure threshold</Label>
          <Input
            type="number"
            min={1}
            value={data.failureThreshold}
            onChange={(e) =>
              setData({ ...data, failureThreshold: Number(e.target.value) || 1 })
            }
          />
        </label>
        <label className="space-y-1">
          <Label>Cooldown (ms)</Label>
          <Input
            type="number"
            min={1000}
            value={data.cooldownMs}
            onChange={(e) => setData({ ...data, cooldownMs: Number(e.target.value) || 1000 })}
          />
        </label>
        <label className="space-y-1">
          <Label>Half-open probes</Label>
          <Input
            type="number"
            min={1}
            value={data.halfOpenMaxCalls}
            onChange={(e) =>
              setData({ ...data, halfOpenMaxCalls: Number(e.target.value) || 1 })
            }
          />
        </label>
      </div>
      <label className="space-y-1 text-[13px]">
        <Label>Ignore hosts (one per line)</Label>
        <textarea
          className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[12px]"
          value={ignoreText}
          onChange={(e) => setIgnoreText(e.target.value)}
          placeholder="api.internal.local"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void save()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
          Reload
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void reset()}>
          Reset all
        </Button>
      </div>
      {data.breakers.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No breakers have tripped yet.</p>
      ) : (
        <ul className="space-y-2 text-[12px]">
          {data.breakers.map((b) => (
            <li
              key={b.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span>
                <span className="font-medium text-foreground">{b.key}</span>{" "}
                <span
                  className={
                    b.state === "open"
                      ? "text-red-500"
                      : b.state === "half_open"
                        ? "text-amber-500"
                        : "text-muted-foreground"
                  }
                >
                  {b.state}
                </span>{" "}
                · failures {b.failures}
                {b.lastStatus != null ? ` · last HTTP ${b.lastStatus}` : ""}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => void reset(b.key)}>
                Reset
              </Button>
            </li>
          ))}
        </ul>
      )}
      {msg ? <p className="text-[12px] text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
