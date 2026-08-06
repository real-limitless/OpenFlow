import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Braces,
  Check,
  Download,
  KeyRound,
  LayoutGrid,
  MoreHorizontal,
  Redo2,
  Save,
  Share2,
  Table2,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { OpenFlowLogo } from "@/components/brand/openflow-logo";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MigrationReportDialog } from "./MigrationReport";
import { ImportCredentialsDialog } from "@/components/credentials";
import { ShareDialog } from "@/components/share/share-dialog";
import { projectHeaders } from "@/lib/projects/client";
import type { IWorkflow } from "@/lib/workflow/types";
import { EnvironmentSwitcher } from "./EnvironmentSwitcher";
import { cn } from "@/lib/utils";

export function EditorTopBar({ actions }: { actions?: React.ReactNode }) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const dirty = useWorkflowStore((s) => s.dirty);
  const { setName, setActive, commit, persist, undo, redo, load } = useWorkflowStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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
        credentials: "include",
        headers: projectHeaders({ "Content-Type": "application/json" }),
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

  const handleSave = () => {
    void persist();
    toast.success("Workflow saved");
  };

  const secondaryItems = (
    <>
      <DropdownMenuItem onClick={() => commit((wf) => autoLayout(wf))}>
        <LayoutGrid className="mr-2 size-4" /> Tidy
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => fileInput.current?.click()}>
        <Upload className="mr-2 size-4" /> Import
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleExport}>
        <Download className="mr-2 size-4" /> Export
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setReportOpen(true)}>
        <Check className="mr-2 size-4" /> Report
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setCredsOpen(true)}>
        <KeyRound className="mr-2 size-4" /> Credentials
        {missingCount > 0 && (
          <span className="ml-auto rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            {missingCount}
          </span>
        )}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setShareOpen(true)}>
        <Share2 className="mr-2 size-4" /> Share
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link to="/credentials">Vault</Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/variables">
          <Braces className="mr-2 size-4" /> Vars
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/data-tables">
          <Table2 className="mr-2 size-4" /> Tables
        </Link>
      </DropdownMenuItem>
    </>
  );

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3">
      <Link to="/" className="flex items-center gap-2 pr-2 text-primary" aria-label="All workflows">
        <OpenFlowLogo className="size-5" withPlate />
        <span className="hidden font-mono text-[13px] font-semibold tracking-tight text-foreground sm:inline">
          OpenFlow
        </span>
      </Link>

      <Input
        value={workflow.name}
        onChange={(e) => setName(e.target.value)}
        className="h-9 min-w-0 w-32 border-transparent bg-transparent text-[14px] font-medium hover:border-border focus:border-border sm:w-44 md:w-56"
      />

      <div className="ml-auto flex min-w-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={undo} aria-label="Undo">
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={redo} aria-label="Redo">
          <Redo2 className="size-4" />
        </Button>

        <div className="hidden items-center gap-1 xl:flex">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12px]"
            onClick={() => commit((wf) => autoLayout(wf))}
          >
            <LayoutGrid className="mr-1 size-4" /> Tidy
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
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
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12px]"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="mr-1 size-4" /> Share
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
            <Link to="/credentials">Vault</Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
            <Link to="/variables">
              <Braces className="mr-1 size-4" /> Vars
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
            <Link to="/data-tables">
              <Table2 className="mr-1 size-4" /> Tables
            </Link>
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 xl:hidden"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {secondaryItems}
          </DropdownMenuContent>
        </DropdownMenu>

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

        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <div className="hidden sm:block">
          <EnvironmentSwitcher />
        </div>

        <span className="mx-1 hidden h-5 w-px bg-border md:block" />

        {actions}

        <label className="flex items-center gap-1.5 pr-0.5 text-[11px] text-muted-foreground sm:gap-2 sm:pr-1 sm:text-[12px]">
          <span className="hidden xs:inline sm:inline">Active</span>
          <Switch checked={workflow.active} onCheckedChange={handleActiveChange} />
        </label>

        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          className={cn("h-8 shrink-0 text-[12px]", !dirty && "text-muted-foreground")}
          disabled={!dirty}
          onClick={handleSave}
        >
          {dirty ? (
            <>
              <Save className="mr-1 size-4" /> Save
            </>
          ) : (
            <>
              <Check className="mr-1 size-4" /> Saved
            </>
          )}
        </Button>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        resourceType="workflow"
        resourceId={workflow.id}
        resourceName={workflow.name}
      />
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
