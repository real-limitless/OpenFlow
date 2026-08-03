import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchAuthStatus } from "@/lib/auth/client";
import { getSelectedProjectId } from "@/lib/projects/client";
import { importTemplate } from "@/lib/templates/client";

export function ImportTemplateButton({
  templateId,
  className,
}: {
  templateId: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const onImport = async () => {
    setBusy(true);
    try {
      const { user, authDisabled } = await fetchAuthStatus();
      if (!authDisabled && !user) {
        navigate({
          to: "/login",
          search: { redirect: `/templates/${templateId}` },
        });
        return;
      }
      const projectId = getSelectedProjectId();
      const wf = await importTemplate(templateId, projectId);
      toast.success(`Added “${wf.name}” to your project`);
      navigate({ to: "/workflow/$id", params: { id: wf.id } });
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 401 || e.message === "Authentication required") {
        navigate({
          to: "/login",
          search: { redirect: `/templates/${templateId}` },
        });
        return;
      }
      toast.error(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button className={className} onClick={() => void onImport()} disabled={busy}>
      {busy ? (
        <Loader2 className="mr-1.5 size-4 animate-spin" />
      ) : (
        <Download className="mr-1.5 size-4" />
      )}
      Add to project
    </Button>
  );
}
