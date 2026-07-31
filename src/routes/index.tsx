import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Braces,
  FileJson,
  KeyRound,
  Plus,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  getRepository,
  migrateLocalToApi,
  countLocalWorkflows,
  probeApi,
  getStorageKind,
} from "@/lib/storage/repository";
import { EMPTY_WORKFLOW, type IWorkflow } from "@/lib/workflow/types";
import { newId, parseWorkflowJson } from "@/lib/workflow/schema";
import { SAMPLE_WORKFLOW } from "@/lib/workflow/sample";
import { migrationReport } from "@/lib/workflow/graph";
import {
  collectWorkflowCredentials,
  fetchLocalCredentials,
} from "@/lib/workflow/credentials-inventory";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ImportCredentialsDialog } from "@/components/credentials";
import {
  fetchProjects,
  getSelectedProjectId,
  setSelectedProjectId,
  type ProjectSummary,
} from "@/lib/projects/client";
import {
  fetchEnvironments,
  getSelectedEnvironmentId,
  setSelectedEnvironmentId,
  type EnvironmentSummary,
} from "@/lib/environments/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenFlow — Open-source visual workflow editor" },
      {
        name: "description",
        content:
          "Import, edit and export workflow automation JSON in a modern React Flow canvas. Clean-room, self-hosted first, open source.",
      },
      { property: "og:title", content: "OpenFlow — Open-source visual workflow editor" },
      {
        property: "og:description",
        content:
          "A clean-room visual workflow editor with high-fidelity workflow JSON import and export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkflowList,
});

function WorkflowList() {
  const [workflows, setWorkflows] = useState<IWorkflow[] | null>(null);
  const [migrateCount, setMigrateCount] = useState<number | null>(null);
  const [importDraft, setImportDraft] = useState<IWorkflow | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => void getRepository().list().then(setWorkflows);
  useEffect(refresh, [projectId]);

  useEffect(() => {
    void fetchProjects().then((list) => {
      setProjects(list);
      const stored = getSelectedProjectId();
      const next =
        (stored && list.find((p) => p.id === stored)?.id) ||
        list.find((p) => p.type === "personal")?.id ||
        list[0]?.id ||
        null;
      if (next && next !== stored) setSelectedProjectId(next);
      setProjectId(next);
    });
  }, []);

  useEffect(() => {
    if (!projectId) {
      setEnvironments([]);
      setEnvironmentId(null);
      return;
    }
    void fetchEnvironments(projectId).then((list) => {
      setEnvironments(list);
      const stored = getSelectedEnvironmentId();
      const next =
        (stored && list.find((e) => e.id === stored)?.id) ||
        list.find((e) => e.isDefault)?.id ||
        list[0]?.id ||
        null;
      if (next !== stored) setSelectedEnvironmentId(next);
      setEnvironmentId(next);
    });
  }, [projectId]);

  useEffect(() => {
    void (async () => {
      const apiUp = await probeApi();
      if (!apiUp) return;
      const n = await countLocalWorkflows();
      setMigrateCount(n > 0 ? n : null);
      // Auto-migrate so execute/subflows see the same ids as the editor
      if (n > 0) {
        try {
          const migrated = await migrateLocalToApi();
          if (migrated > 0) {
            toast.success(`Synced ${migrated} browser workflow${migrated > 1 ? "s" : ""} to the database`);
            setMigrateCount(null);
            refresh();
          }
        } catch (err) {
          console.error(err);
          toast.error("Could not sync browser workflows to the database");
        }
      }
    })();
  }, []);

  const migrateFromLocalStorage = async () => {
    try {
      const migrated = await migrateLocalToApi();
      if (migrated === 0) {
        toast.message("No local workflows to migrate");
        return;
      }
      toast.success(`Migrated ${migrated} workflow${migrated > 1 ? "s" : ""} from localStorage`);
      setMigrateCount(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Migration failed");
    }
  };

  const create = async (workflow: IWorkflow) => {
    const saved = await getRepository().save(workflow);
    navigate({ to: "/workflow/$id", params: { id: saved.id } });
  };

  const onImport = async (file: File) => {
    const result = parseWorkflowJson(await file.text(), newId("wf"));
    if (!result.ok || !result.workflow) {
      toast.error(result.error ?? "Import failed");
      return;
    }
    const locals = await fetchLocalCredentials();
    const inv = collectWorkflowCredentials(result.workflow, locals);
    if (inv.missingCount > 0) {
      setImportDraft(result.workflow);
      return;
    }
    await create(result.workflow);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-14">
      <div className="flex flex-wrap items-center gap-3 text-primary">
        <div className="flex items-center gap-2">
          <WorkflowIcon className="size-6" />
          <span className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
            OpenFlow
          </span>
        </div>
        {projects.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Project</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={projectId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedProjectId(id);
                setProjectId(id);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.type === "personal" ? " (personal)" : ""} · {p.role}
                </option>
              ))}
            </select>
          </label>
        )}
        {environments.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Environment</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={environmentId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedEnvironmentId(id);
                setEnvironmentId(id);
              }}
            >
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.isDefault ? " ★" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <h1 className="mt-8 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight">
        A clean-room workflow editor that speaks your existing workflow JSON.
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Import a workflow export, rewire it on a React Flow canvas, edit parameters through
        schema-generated forms, and export it back byte-for-byte compatible. Twelve core node types
        are implemented; everything else round-trips as a preserved placeholder.
      </p>

      <div className="mt-7 flex flex-wrap gap-2">
        <Button onClick={() => create(EMPTY_WORKFLOW(newId("wf")))}>
          <Plus className="mr-1 size-4" /> New workflow
        </Button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="mr-1 size-4" /> Import JSON
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const result = parseWorkflowJson(SAMPLE_WORKFLOW, newId("wf"));
            if (result.workflow) void create(result.workflow);
          }}
        >
          <Sparkles className="mr-1 size-4" /> Start from example
        </Button>
        <Button variant="outline" asChild>
          <Link to="/credentials">
            <KeyRound className="mr-1 size-4" /> Credentials
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/variables">
            <Braces className="mr-1 size-4" /> Variables
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/data-tables">
            <Table2 className="mr-1 size-4" /> Data tables
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/docs/compatibility">
            Compatibility <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>

      <ImportCredentialsDialog
        open={importDraft != null}
        onOpenChange={(o) => {
          if (!o) setImportDraft(null);
        }}
        workflow={importDraft ?? EMPTY_WORKFLOW("draft")}
        title="Map imported credentials"
        allowSkip
        onComplete={(wf) => {
          setImportDraft(null);
          void create(wf);
        }}
      />

      {migrateCount !== null && migrateCount > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="text-[13px] text-foreground">
            {migrateCount} workflow{migrateCount > 1 ? "s" : ""} still only in this browser
            (localStorage). Execution and sub-workflows use the database.
          </p>
          <Button size="sm" variant="outline" onClick={() => void migrateFromLocalStorage()}>
            Sync to database
          </Button>
        </div>
      )}

      <section className="mt-14">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Your workflows
          <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">
            · storage: {getStorageKind() === "api" ? "database" : "browser only"}
          </span>
        </h2>

        <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {workflows === null && <p className="p-6 text-[13px] text-muted-foreground">Loading…</p>}
          {workflows?.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <FileJson className="size-8 text-muted-foreground" />
              <p className="text-[14px] text-muted-foreground">
                Nothing here yet. Create one or import an existing export.
              </p>
            </div>
          )}
          {workflows?.map((wf) => {
            const nodeCount =
              Array.isArray(wf.nodes) && wf.nodes.length > 0
                ? wf.nodes.length
                : Number((wf as { nodeCount?: number }).nodeCount ?? 0);
            const rows = Array.isArray(wf.nodes) && wf.nodes.length > 0 ? migrationReport(wf) : [];
            const unsupported = rows.filter((r) => r.status === "placeholder").length;
            return (
              <div key={wf.id} className="flex items-center gap-3 px-4 py-3">
                <Link
                  to="/workflow/$id"
                  params={{ id: wf.id }}
                  className="min-w-0 flex-1 hover:text-primary"
                >
                  <p className="truncate text-[14px] font-medium">{wf.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {nodeCount} nodes
                    {unsupported > 0 && ` · ${unsupported} unsupported`}
                    {wf.updatedAt && ` · updated ${new Date(wf.updatedAt).toLocaleString()}`}
                    <span className="ml-1 opacity-70">· {wf.id}</span>
                  </p>
                </Link>
                {wf.active && (
                  <span className="rounded-full bg-[var(--success)]/12 px-2 py-0.5 text-[11px] text-[var(--success)]">
                    active
                  </span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${wf.name}`}
                  onClick={async () => {
                    await getRepository().remove(wf.id);
                    refresh();
                    toast.success("Workflow deleted");
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
