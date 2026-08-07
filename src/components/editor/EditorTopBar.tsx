import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AppWindow,
  Braces,
  Bug,
  Check,
  Download,
  KeyRound,
  LayoutGrid,
  LayoutTemplate,
  MoreHorizontal,
  PanelRight,
  Redo2,
  Save,
  Share2,
  Table2,
  Undo2,
  Upload,
} from "lucide-react";
import type { DockviewApi } from "dockview";
import { toast } from "sonner";
import { OpenFlowLogo } from "@/components/brand/openflow-logo";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  parseWorkflowJson,
  serializeWorkflow,
  type WorkflowExportMode,
} from "@/lib/workflow/schema";
import { openGeneralIssueUrl } from "@/lib/feedback/github-issue";
import { prepareIssueReport } from "@/lib/feedback/debug-bundle";
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
import { EDITOR_PANELS, type EditorPanelId } from "@/components/editor/dock/panel-registry";
import {
  floatEditorPanel,
  openEditorPanel,
  popoutEditorPanel,
  resetEditorDockLayout,
} from "@/components/editor/dock/EditorDockHost";

export function EditorTopBar({
  actions,
  dockApiRef,
}: {
  actions?: React.ReactNode;
  dockApiRef?: React.MutableRefObject<DockviewApi | null>;
}) {
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

  const handleExport = (mode: WorkflowExportMode = "openflow") => {
    const blob = new Blob([serializeWorkflow(workflow, { mode })], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = workflow.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "workflow";
    a.download = mode === "n8n" ? `${base}.n8n.json` : `${base}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(mode === "n8n" ? "Exported n8n-compatible JSON" : "Workflow exported");
  };

  const handleReportIssue = async () => {
    try {
      toast.message("Preparing debug bundle…");
      const diagnostics = {
        summary: `Issue report from workflow editor`,
        workflowId: workflow.id,
        workflowName: workflow.name,
        extra: {
          nodeCount: workflow.nodes.length,
          nodeTypes: [...new Set(workflow.nodes.map((n) => n.type))].slice(0, 80),
        },
      };
      const { bundleName } = await prepareIssueReport(diagnostics);
      const url = openGeneralIssueUrl({
        ...diagnostics,
        summary: `Issue report from workflow editor (bundle: ${bundleName})`,
      });
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success(`Downloaded ${bundleName} — attach it on GitHub`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare report");
      window.open(openGeneralIssueUrl({ workflowId: workflow.id, workflowName: workflow.name }), "_blank");
    }
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

  const dockApi = () => dockApiRef?.current ?? null;

  const viewPanelItems = EDITOR_PANELS.filter((p) => p.viewMenu).map((p) => (
    <DropdownMenuItem
      key={p.id}
      onClick={() => {
        openEditorPanel(dockApi(), p.id as EditorPanelId);
      }}
    >
      <PanelRight className="mr-2 size-4" />
      {p.title}
    </DropdownMenuItem>
  ));

  const moreItems = (
    <>
      <DropdownMenuItem onClick={() => commit((wf) => autoLayout(wf))}>
        <LayoutGrid className="mr-2 size-4" /> Tidy layout
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => fileInput.current?.click()}>
        <Upload className="mr-2 size-4" /> Import
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleExport("openflow")}>
        <Download className="mr-2 size-4" /> Export (OpenFlow)
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleExport("n8n")}>
        <Download className="mr-2 size-4" /> Export (n8n-compatible)
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setReportOpen(true)}>
        <Check className="mr-2 size-4" /> Migration report
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void handleReportIssue()}>
        <Bug className="mr-2 size-4" /> Report issue
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
        <Link to="/credentials">
          <KeyRound className="mr-2 size-4" /> Vault
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/variables">
          <Braces className="mr-2 size-4" /> Variables
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/data-tables">
          <Table2 className="mr-2 size-4" /> Data tables
        </Link>
      </DropdownMenuItem>
    </>
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border bg-sidebar px-2 sm:gap-2 sm:px-3">
      <Link
        to="/"
        className="flex shrink-0 items-center gap-1.5 pr-1 text-primary"
        aria-label="All workflows"
      >
        <OpenFlowLogo className="size-5" withPlate />
        <span className="hidden font-mono text-[13px] font-semibold tracking-tight text-foreground lg:inline">
          OpenFlow
        </span>
      </Link>

      <Input
        value={workflow.name}
        onChange={(e) => setName(e.target.value)}
        title={workflow.name}
        className="h-8 min-w-0 max-w-[10rem] flex-1 border-transparent bg-transparent px-1.5 text-[13px] font-medium hover:border-border focus:border-border sm:max-w-[14rem] md:max-w-[18rem]"
      />

      {/* Left tools — may shrink; never push Execute/Save off-screen */}
      <div className="flex min-w-0 shrink items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={undo}
          aria-label="Undo"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={redo}
          aria-label="Redo"
        >
          <Redo2 className="size-4" />
        </Button>

        {dockApiRef && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="View panels"
                title="View panels"
              >
                <LayoutTemplate className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {viewPanelItems}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  const api = dockApi();
                  const active = api?.activePanel?.id as EditorPanelId | undefined;
                  if (active && active !== "canvas") floatEditorPanel(api, active);
                  else toast.message("Select a panel tab first, then float it");
                }}
              >
                <AppWindow className="mr-2 size-4" /> Float active panel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const api = dockApi();
                  const active = api?.activePanel?.id as EditorPanelId | undefined;
                  if (active && active !== "canvas") void popoutEditorPanel(api, active);
                  else toast.message("Select a panel tab first, then pop out");
                }}
              >
                <AppWindow className="mr-2 size-4" /> Pop out active panel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => resetEditorDockLayout(dockApi())}>
                <LayoutTemplate className="mr-2 size-4" /> Reset layout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative size-8 shrink-0"
              aria-label="More actions"
              title="More"
            >
              <MoreHorizontal className="size-4" />
              {missingCount > 0 && (
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-destructive" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {moreItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

      {/* Core right cluster — always visible, never shrinks */}
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
        <div className="hidden min-w-0 max-w-[9rem] sm:block">
          <EnvironmentSwitcher />
        </div>

        <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" />

        <div className="flex shrink-0 items-center">{actions}</div>

        <label
          className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
          title="Active workflow"
        >
          <span className="hidden md:inline">Active</span>
          <Switch checked={workflow.active} onCheckedChange={handleActiveChange} />
        </label>

        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          className={cn("h-8 shrink-0 px-2.5 text-[12px]", !dirty && "text-muted-foreground")}
          disabled={!dirty}
          onClick={handleSave}
        >
          {dirty ? (
            <>
              <Save className="mr-1 size-3.5" />
              <span>Save</span>
            </>
          ) : (
            <>
              <Check className="mr-1 size-3.5" />
              <span className="hidden sm:inline">Saved</span>
              <span className="sm:hidden">OK</span>
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
