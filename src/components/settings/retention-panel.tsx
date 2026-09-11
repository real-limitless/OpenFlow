import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Policy = {
  retentionDays: number;
  maxExecutionsPerWorkflow: number;
  redactRunData: boolean;
  redactPii: boolean;
  pruneActive: boolean;
  note?: string;
};

export function RetentionPanel() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/settings/retention");
    if (!res.ok) return;
    setPolicy((await res.json()) as Policy);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!policy) return;
    const res = await apiFetch("/api/v1/settings/retention", {
      method: "PUT",
      body: JSON.stringify(policy),
    });
    if (!res.ok) {
      setMsg("Save failed (admin only when auth is on)");
      return;
    }
    setPolicy((await res.json()) as Policy);
    setMsg("Saved");
  };

  const prune = async () => {
    const res = await apiFetch("/api/v1/settings/retention/prune", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
    setMsg(res.ok ? `Pruned ${body.deleted ?? 0} execution(s)` : body.error ?? "Prune failed");
    await refresh();
  };

  if (!policy) {
    return <p className="text-[13px] text-muted-foreground">Loading retention…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Execution retention and redaction</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{policy.note}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 text-[13px]">
        <label className="space-y-1">
          <Label>Retention days (0 = off)</Label>
          <Input
            type="number"
            min={0}
            value={policy.retentionDays}
            onChange={(e) =>
              setPolicy({ ...policy, retentionDays: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label className="space-y-1">
          <Label>Max finished runs per workflow (0 = off)</Label>
          <Input
            type="number"
            min={0}
            value={policy.maxExecutionsPerWorkflow}
            onChange={(e) =>
              setPolicy({ ...policy, maxExecutionsPerWorkflow: Number(e.target.value) || 0 })
            }
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={policy.redactRunData}
          onChange={(e) => setPolicy({ ...policy, redactRunData: e.target.checked })}
        />
        Redact credentials in stored runData (passwords, tokens, API keys)
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={policy.redactPii}
          onChange={(e) => setPolicy({ ...policy, redactPii: e.target.checked })}
        />
        Redact email-shaped strings in stored runData
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={policy.pruneActive}
          onChange={(e) => setPolicy({ ...policy, pruneActive: e.target.checked })}
        />
        Allow prune of waiting/running executions
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void save()}>
          Save policy
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void prune()}>
          Prune now
        </Button>
      </div>
      {msg ? <p className="text-[12px] text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
