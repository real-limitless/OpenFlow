import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";

export const Route = createFileRoute("/settings/code")({
  head: () => ({ meta: [{ title: "Code node — OpenFlow" }] }),
  component: CodeSettingsPage,
});

type CodeSettingsResponse = {
  python: {
    allowImports: string[];
    builtinAllowImports: string[];
    envAllowImports: string[];
  };
};

function CodeSettingsPage() {
  const [text, setText] = useState("");
  const [builtin, setBuiltin] = useState<string[]>([]);
  const [envExtra, setEnvExtra] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/settings/code");
      if (!res.ok) {
        toast.error("Failed to load Code settings");
        return;
      }
      const body = (await res.json()) as CodeSettingsResponse;
      setText((body.python.allowImports ?? []).join("\n"));
      setBuiltin(body.python.builtinAllowImports ?? []);
      setEnvExtra(body.python.envAllowImports ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    setSaving(true);
    try {
      const allowImports = text
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiFetch("/api/v1/settings/code", {
        method: "PUT",
        body: JSON.stringify({ python: { allowImports } }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(b.error ?? "Save failed");
        return;
      }
      const body = (await res.json()) as CodeSettingsResponse;
      setText((body.python.allowImports ?? []).join("\n"));
      setEnvExtra(body.python.envAllowImports ?? []);
      toast.success("Code settings saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-[15px] font-medium">Code node</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Runtime options for the Code node. Python (native) runs in a restricted host interpreter;
        dangerous modules (<code className="rounded bg-muted px-1">os</code>,{" "}
        <code className="rounded bg-muted px-1">subprocess</code>, …) stay blocked even if listed
        here.
      </p>

      <div className="mt-6 space-y-2">
        <Label htmlFor="py-imports">Extra Python imports (allowlist)</Label>
        <p className="text-[12px] text-muted-foreground">
          One module per line (or comma-separated), e.g.{" "}
          <code className="rounded bg-muted px-1">numpy</code>,{" "}
          <code className="rounded bg-muted px-1">requests</code>. Packages must already be installed
          for the worker&apos;s <code className="rounded bg-muted px-1">python3</code>.
        </p>
        <textarea
          id="py-imports"
          className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[12px]"
          value={text}
          disabled={loading || saving}
          onChange={(e) => setText(e.target.value)}
          placeholder={"numpy\nrequests"}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void save()} disabled={loading || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            Reload
          </Button>
        </div>
      </div>

      {envExtra.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[13px] font-medium">From environment</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Also allowed via <code className="rounded bg-muted px-1">OPENFLOW_PYTHON_ALLOW_IMPORTS</code>{" "}
            (merged with the list above; not editable here):
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{envExtra.join(", ")}</p>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-[13px] font-medium">Built-in safe stdlib</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Always available without listing them above:
        </p>
        <p className="mt-2 max-h-32 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {loading ? "…" : builtin.join(", ")}
        </p>
      </div>
    </div>
  );
}
