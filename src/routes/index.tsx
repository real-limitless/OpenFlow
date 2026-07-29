import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  FileJson,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getRepository, apiRepository, localRepository } from "@/lib/storage/repository";
import { EMPTY_WORKFLOW, type IWorkflow } from "@/lib/workflow/types";
import { newId, parseWorkflowJson } from "@/lib/workflow/schema";
import { SAMPLE_WORKFLOW } from "@/lib/workflow/sample";
import { migrationReport } from "@/lib/workflow/graph";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

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
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => void getRepository().list().then(setWorkflows);
  useEffect(refresh, []);

  useEffect(() => {
    if (!import.meta.env.VITE_API_BASE_URL) return;
    localRepository.list().then((list) => setMigrateCount(list.length || null));
  }, []);

  const migrateFromLocalStorage = async () => {
    const localWorkflows = await localRepository.list();
    if (localWorkflows.length === 0) return;
    let migrated = 0;
    for (const wf of localWorkflows) {
      await apiRepository.save(wf);
      migrated++;
    }
    toast.success(`Migrated ${migrated} workflow${migrated > 1 ? "s" : ""} from localStorage`);
    setMigrateCount(null);
    refresh();
  };

  const create = async (workflow: IWorkflow) => {
    await getRepository().save(workflow);
    navigate({ to: "/workflow/$id", params: { id: workflow.id } });
  };

  const onImport = async (file: File) => {
    const result = parseWorkflowJson(await file.text(), newId("wf"));
    if (!result.ok || !result.workflow) {
      toast.error(result.error ?? "Import failed");
      return;
    }
    await create(result.workflow);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-14">
      <div className="flex items-center gap-2 text-primary">
        <WorkflowIcon className="size-6" />
        <span className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
          OpenFlow
        </span>
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
        <Button variant="ghost" asChild>
          <Link to="/docs/compatibility">
            Compatibility <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>

      {migrateCount !== null && (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="text-[13px] text-foreground">
            You have {migrateCount} local workflow{migrateCount > 1 ? "s" : ""} stored in this
            browser.
          </p>
          <Button size="sm" variant="outline" onClick={migrateFromLocalStorage}>
            Migrate from localStorage
          </Button>
        </div>
      )}

      <section className="mt-14">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Your workflows
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
            const rows = migrationReport(wf);
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
                    {wf.nodes.length} nodes
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
