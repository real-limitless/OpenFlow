import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FileJson, Plus, Share2, Sparkles, Store, Trash2, Upload } from "lucide-react";
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
import { ImportCredentialsDialog } from "@/components/credentials";
import { ShareDialog } from "@/components/share/share-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { WelcomePanel } from "@/components/onboarding/welcome-panel";
import {
  armOnboardingBanner,
  loadOnboardingState,
  patchOnboardingState,
  shouldShowOnboarding,
  type OnboardingState,
} from "@/lib/onboarding/state";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenFlow — Open-source visual workflow editor" },
      {
        name: "description",
        content:
          "Import, edit and export workflow automation JSON in a modern React Flow canvas.",
      },
    ],
  }),
  component: WorkflowList,
});

function WorkflowList() {
  const [workflows, setWorkflows] = useState<IWorkflow[] | null>(null);
  const [migrateCount, setMigrateCount] = useState<number | null>(null);
  const [importDraft, setImportDraft] = useState<IWorkflow | null>(null);
  const [shareWf, setShareWf] = useState<IWorkflow | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState>(() => loadOnboardingState());
  const [busySample, setBusySample] = useState(false);
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () =>
    void getRepository()
      .list()
      .then(setWorkflows)
      .catch(() => setWorkflows([]));

  useEffect(() => {
    refresh();
    const onScope = () => refresh();
    window.addEventListener("openflow:scope-change", onScope);
    return () => window.removeEventListener("openflow:scope-change", onScope);
  }, []);

  useEffect(() => {
    void (async () => {
      const apiUp = await probeApi();
      if (!apiUp) return;
      const n = await countLocalWorkflows();
      setMigrateCount(n > 0 ? n : null);
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

  const startSample = async () => {
    setBusySample(true);
    try {
      const result = parseWorkflowJson(SAMPLE_WORKFLOW, newId("wf"));
      if (!result.ok || !result.workflow) {
        toast.error(result.error ?? "Could not load sample workflow");
        return;
      }
      const saved = await getRepository().save(result.workflow);
      const next = patchOnboardingState({ sampleCreated: true });
      setOnboarding(next);
      toast.success("Sample workflow ready — click Execute to run it");
      armOnboardingBanner();
      navigate({ to: "/workflow/$id", params: { id: saved.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create sample");
    } finally {
      setBusySample(false);
    }
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

  const empty = workflows !== null && workflows.length === 0;
  const showWelcome =
    workflows !== null && shouldShowOnboarding(onboarding, workflows.length);

  return (
    <PageShell>
      <h1 className="max-w-2xl text-3xl font-semibold leading-[1.15] tracking-tight">
        Workflows
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
        Import, edit, and run automation workflows. Use the header to switch project and
        environment.
      </p>

      {showWelcome ? (
        <WelcomePanel
          state={onboarding}
          empty={empty}
          busySample={busySample}
          onRunSample={() => void startSample()}
          onNewBlank={() => void create(EMPTY_WORKFLOW(newId("wf")))}
          onImport={() => fileInput.current?.click()}
          onDismiss={() => setOnboarding(patchOnboardingState({ dismissed: true }))}
        />
      ) : (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => void create(EMPTY_WORKFLOW(newId("wf")))}>
            <Plus className="mr-1 size-4" /> New workflow
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload className="mr-1 size-4" /> Import JSON
          </Button>
          <Button variant="outline" asChild>
            <Link to="/templates" search={{}}>
              <Store className="mr-1 size-4" /> Browse templates
            </Link>
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
        </div>
      )}

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

      {shareWf && (
        <ShareDialog
          open
          onOpenChange={(o) => {
            if (!o) setShareWf(null);
          }}
          resourceType="workflow"
          resourceId={shareWf.id}
          resourceName={shareWf.name}
        />
      )}

      {migrateCount !== null && migrateCount > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="text-[13px] text-foreground">
            {migrateCount} workflow{migrateCount > 1 ? "s" : ""} still only in this browser.
          </p>
          <Button size="sm" variant="outline" onClick={() => void migrateFromLocalStorage()}>
            Sync to database
          </Button>
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Your workflows
          <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">
            · storage: {getStorageKind() === "api" ? "database" : "browser only"}
          </span>
        </h2>

        <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {workflows === null && <p className="p-6 text-[13px] text-muted-foreground">Loading…</p>}
          {workflows?.length === 0 && !showWelcome && (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <FileJson className="size-8 text-muted-foreground" />
              <p className="text-[14px] text-muted-foreground">
                Nothing here yet. Create one or import an existing export.
              </p>
            </div>
          )}
          {workflows?.length === 0 && showWelcome && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                Your list is empty — use the welcome steps above to get started.
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
                  className="size-8"
                  aria-label={`Share ${wf.name}`}
                  onClick={() => setShareWf(wf)}
                >
                  <Share2 className="size-4" />
                </Button>
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
    </PageShell>
  );
}
