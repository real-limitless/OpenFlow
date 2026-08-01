import { useCallback, useEffect, useState } from "react";
import { Braces, Layers } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  fetchEnvironments,
  getSelectedEnvironmentId,
  setSelectedEnvironmentId,
  type EnvironmentSummary,
} from "@/lib/environments/client";
import { getSelectedProjectId } from "@/lib/projects/client";
import { apiFetch } from "@/lib/auth/client";
import { useWorkflowStore } from "@/store/workflow-store";
import { collectWorkflowCredentials } from "@/lib/workflow/credentials-inventory";

type VarRow = { id: string; key: string; secret?: boolean; environmentId?: string | null };

export function EnvironmentSwitcher() {
  const workflow = useWorkflowStore((s) => s.workflow);
  const [envs, setEnvs] = useState<EnvironmentSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [vars, setVars] = useState<VarRow[]>([]);
  const [credNames, setCredNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    const projectId = getSelectedProjectId();
    const list = await fetchEnvironments(projectId);
    setEnvs(list);
    const stored = getSelectedEnvironmentId();
    const next =
      (stored && list.find((e) => e.id === stored)?.id) ||
      list.find((e) => e.isDefault)?.id ||
      list[0]?.id ||
      null;
    if (next !== stored) setSelectedEnvironmentId(next);
    setEnvironmentId(next);

    try {
      const q = new URLSearchParams({ scope: "project", layer: "all" });
      const res = await apiFetch(`/api/v1/variables?${q}`);
      if (res.ok) {
        const rows = (await res.json()) as VarRow[];
        // Show base (null env) + current env overrides
        setVars(
          rows.filter(
            (r) => r.environmentId == null || r.environmentId === next || !r.environmentId,
          ),
        );
      }
    } catch {
      setVars([]);
    }

    const inv = collectWorkflowCredentials(workflow, []);
    setCredNames([
      ...new Set(inv.slots.map((s) => s.suggestedName || s.displayName || s.type).filter(Boolean)),
    ]);
  }, [workflow]);

  useEffect(() => {
    void load();
    const onScope = () => void load();
    window.addEventListener("openflow:scope-change", onScope);
    return () => window.removeEventListener("openflow:scope-change", onScope);
  }, [load]);

  const current = envs.find((e) => e.id === environmentId);

  if (envs.length === 0) {
    return (
      <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
        <Link to="/settings/environments">
          <Layers className="mr-1 size-3.5" /> Env
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        className="h-8 max-w-[9rem] rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
        value={environmentId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          setSelectedEnvironmentId(id);
          setEnvironmentId(id);
          window.dispatchEvent(new CustomEvent("openflow:scope-change"));
        }}
        aria-label="Environment"
        title="Variables and execution use this environment"
      >
        {envs.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.isDefault ? " ★" : ""}
          </option>
        ))}
      </select>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-[11px] text-muted-foreground"
            title="Environment context for this workflow"
          >
            <Badge variant="secondary" className="h-5 font-mono text-[10px]">
              {current?.name ?? "env"}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3 p-3">
          <div>
            <p className="text-[12px] font-medium">Running as {current?.name ?? "—"}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Execute uses this environment&apos;s variable overrides. Same workflow graph, different
              values.
            </p>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <Braces className="size-3" /> $vars
            </p>
            {vars.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No project variables yet.</p>
            ) : (
              <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                {vars.slice(0, 24).map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-foreground">{v.key}</span>
                    <span className="text-muted-foreground">
                      {v.secret ? "••••" : v.environmentId ? "env" : "base"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/variables"
              className="mt-1 inline-block text-[11px] text-primary hover:underline"
            >
              Manage variables
            </Link>
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Credentials on workflow
            </p>
            {credNames.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">None referenced.</p>
            ) : (
              <p className="text-[11px] text-foreground">{credNames.join(", ")}</p>
            )}
            <Link
              to="/credentials"
              className="mt-1 inline-block text-[11px] text-primary hover:underline"
            >
              Open vault
            </Link>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
