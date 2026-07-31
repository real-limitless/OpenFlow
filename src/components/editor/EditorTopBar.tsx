import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  Download,
  KeyRound,
  LayoutGrid,
  Redo2,
  Save,
  Table2,
  Undo2,
  Upload,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkflowStore } from "@/store/workflow-store";
import { parseWorkflowJson, serializeWorkflow } from "@/lib/workflow/schema";
import { autoLayout } from "@/lib/workflow/layout";
import {
  collectWorkflowCredentials,
  fetchLocalCredentials,
} from "@/lib/workflow/credentials-inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MigrationReportDialog } from "./MigrationReport";
import { ImportCredentialsDialog } from "@/components/credentials";
import type { IWorkflow } from "@/lib/workflow/types";

export function EditorTopBar({ actions }: { actions?: React.ReactNode }) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const dirty = useWorkflowStore((s) => s.dirty);
  const { setName, setActive, commit, persist, undo, redo, load } = useWorkflowStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [importDraft, setImportDraft] = useState<IWorkflow | null>(null);
  const [missingCount, setMissingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchLocalCredentials().then((locals) => {
      if (cancelled) return;
      const inv = collectWorkflowCredentials(workflow, locals);
      setMissingCount(inv.missingCount);
    });
    return () => {
      cancelled = true;
    };
  }, [workflow]);

  const handleActiveChange = async (active: boolean) => {
    setActive(active);
    await persist();
    try {
      await fetch(`/api/v1/workflows/${workflow.id}/activate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      toast.success(active ? "Workflow activated" : "Workflow deactivated");
    } catch {
      toast.error("Failed to toggle active state");
    }
  };

  const handleExport = () => {
    const blob = new Blob([serializeWorkflow(workflow)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflow.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "workflow"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Workflow exported");
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const result = parseWorkflowJson(text, workflow.id);
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
    load(result.workflow);
    await persist();
    setReportOpen(true);
  };

  const finishImport = async (wf: IWorkflow) => {
    load(wf);
    await persist();
    setImportDraft(null);
    setReportOpen(true);
    toast.success("Workflow imported");
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3">
      <Link to="/" className="flex items-center gap-2 pr-2 text-primary" aria-label="All workflows">
        <WorkflowIcon className="size-5" />
        <span className="hidden font-mono text-[13px] font-semibold tracking-tight text-foreground sm:inline">
          OpenFlow
        </span>
      </Link>

      <Input
        value={workflow.name}
        onChange={(e) => setName(e.target.value)}
        className="h-9 w-56 border-transparent bg-transparent text-[14px] font-medium hover:border-border focus:border-border"
      />

      <span className="font-mono text-[11px] text-muted-foreground">
        {dirty ? "unsaved" : "saved"}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8" onClick={undo} aria-label="Undo">
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={redo} aria-label="Redo">
          <Redo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-[12px]"
          onClick={() => commit((wf) => autoLayout(wf))}
        >
          <LayoutGrid className="mr-1 size-4" /> Tidy
        </Button>

        <span className="mx-1 h-5 w-px bg-border" />

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-[12px]"
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="mr-1 size-4" /> Import
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={handleExport}>
          <Download className="mr-1 size-4" /> Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-[12px]"
          onClick={() => setReportOpen(true)}
        >
          <Check className="mr-1 size-4" /> Report
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-[12px]"
          onClick={() => setCredsOpen(true)}
        >
          <KeyRound className="mr-1 size-4" /> Credentials
          {missingCount > 0 && (
            <span className="ml-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              {missingCount}
            </span>
          )}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
          <Link to="/credentials">Vault</Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
          <Link to="/data-tables">
            <Table2 className="mr-1 size-4" /> Tables
          </Link>
        </Button>

        <span className="mx-1 h-5 w-px bg-border" />

        {actions}

        <label className="flex items-center gap-2 pr-1 text-[12px] text-muted-foreground">
          Active
          <Switch checked={workflow.active} onCheckedChange={handleActiveChange} />
        </label>

        <Button
          size="sm"
          className="h-8 text-[12px]"
          onClick={() => {
            void persist();
            toast.success("Workflow saved");
          }}
        >
          <Save className="mr-1 size-4" /> Save
        </Button>
      </div>

      <MigrationReportDialog open={reportOpen} onOpenChange={setReportOpen} />
      <ImportCredentialsDialog
        open={credsOpen}
        onOpenChange={setCredsOpen}
        workflow={workflow}
        title="Workflow credentials"
        allowSkip
        onComplete={(wf) => {
          load(wf);
          void persist();
          setCredsOpen(false);
        }}
      />
      <ImportCredentialsDialog
        open={importDraft != null}
        onOpenChange={(o) => {
          if (!o) setImportDraft(null);
        }}
        workflow={importDraft ?? workflow}
        title="Map imported credentials"
        allowSkip
        onComplete={(wf) => void finishImport(wf)}
      />
    </header>
  );
}
