import { useMemo } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveFormPath } from "@/lib/forms/path";
import type { INode } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";

/** Production form URL + embed snippet for Form Trigger nodes. */
export function FormTriggerUrls({ node }: { node: INode }) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const active = workflow.active;

  const path = useMemo(() => resolveFormPath(node), [node]);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const productionUrl = `${origin}/form/${path}`;
  const embedUrl = `${productionUrl}?embed=1`;
  const iframe = `<iframe src="${embedUrl}" title="${(node.parameters?.formTitle as string) || node.name}" style="width:100%;min-height:480px;border:0;border-radius:8px" loading="lazy"></iframe>`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-background/40 p-3">
      <div>
        <p className="text-[13px] font-medium">Public form</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {active
            ? "Workflow is active — this form is live. Share the URL or embed it on a website."
            : "Activate the workflow (top bar) to publish this form at the URL below."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[12px]">Production URL</Label>
        <div className="flex gap-1.5">
          <Input
            readOnly
            value={productionUrl}
            className="h-8 font-mono text-[11px]"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            title="Copy URL"
            onClick={() => void copy(productionUrl, "URL")}
          >
            <Copy className="size-3.5" />
          </Button>
          {active && (
            <Button type="button" size="icon" variant="outline" className="size-8 shrink-0" asChild>
              <a href={productionUrl} target="_blank" rel="noreferrer" title="Open form">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[12px]">Embed (iframe)</Label>
        <div className="flex gap-1.5">
          <Input readOnly value={iframe} className="h-8 font-mono text-[10px]" />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            title="Copy embed code"
            onClick={() => void copy(iframe, "Embed code")}
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className="font-mono text-[10px] text-muted-foreground">Path: /form/{path}</p>
    </div>
  );
}
