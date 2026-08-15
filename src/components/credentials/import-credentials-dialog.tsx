import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { IWorkflow } from "@/lib/workflow/types";
import type { CredentialMeta } from "@/lib/credentials/types";
import {
  applyCredentialMappings,
  collectWorkflowCredentials,
  fetchLocalCredentials,
  type CredentialSlot,
} from "@/lib/workflow/credentials-inventory";
import { CredentialPicker } from "./credential-picker";

interface ImportCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: IWorkflow;
  onComplete: (workflow: IWorkflow) => void;
  /** When true, dialog can be dismissed without fixing missing slots. */
  allowSkip?: boolean;
  title?: string;
}

export function ImportCredentialsDialog({
  open,
  onOpenChange,
  workflow,
  onComplete,
  allowSkip = true,
  title = "Workflow credentials",
}: ImportCredentialsDialogProps) {
  const [locals, setLocals] = useState<CredentialMeta[]>([]);
  const [mappings, setMappings] = useState<Record<string, CredentialMeta>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void fetchLocalCredentials()
      .then((list) => {
        setLocals(list);
        const inv = collectWorkflowCredentials(workflow, list);
        const initial: Record<string, CredentialMeta> = {};
        for (const slot of inv.slots) {
          if (slot.local) initial[slot.key] = slot.local;
        }
        setMappings(initial);
      })
      .finally(() => setLoading(false));
  }, [open, workflow]);

  const inventory = useMemo(
    () => collectWorkflowCredentials(workflow, locals),
    [workflow, locals],
  );

  const unresolved = inventory.slots.filter((s) => !mappings[s.key]);

  const apply = () => {
    const next = applyCredentialMappings(workflow, inventory, mappings);
    onComplete(next);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-left text-[12px] leading-snug text-balance">
            {inventory.slots.length === 0
              ? "This workflow does not reference any credentials."
              : unresolved.length > 0
                ? `${unresolved.length} credential slot${unresolved.length > 1 ? "s" : ""} need a local secret. Create or pick one for each.`
                : "All credential slots are mapped."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-3">
            {loading ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Loading…</p>
            ) : inventory.slots.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing to configure.</p>
            ) : (
              <div className="space-y-4 pb-2">
                {inventory.slots.map((slot) => (
                  <SlotRow
                    key={slot.key}
                    slot={slot}
                    mapped={mappings[slot.key]}
                    onMap={(cred) =>
                      setMappings((prev) => {
                        const next = { ...prev };
                        if (!cred) delete next[slot.key];
                        else next[slot.key] = cred;
                        return next;
                      })
                    }
                    onCreatedLocal={(cred) => setLocals((prev) => [...prev.filter((c) => c.id !== cred.id), cred])}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          {allowSkip && (
            <Button
              variant="ghost"
              onClick={() => {
                onComplete(workflow);
                onOpenChange(false);
              }}
            >
              Skip for now
            </Button>
          )}
          <Button onClick={apply} disabled={loading}>
            {unresolved.length > 0 ? "Apply mapped" : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlotRow({
  slot,
  mapped,
  onMap,
  onCreatedLocal,
}: {
  slot: CredentialSlot;
  mapped?: CredentialMeta;
  onMap: (c: CredentialMeta | null) => void;
  onCreatedLocal: (c: CredentialMeta) => void;
}) {
  const status = mapped ? "ok" : slot.status;
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="break-words text-[13px] font-medium leading-snug">
            {slot.displayName}
            <span className="ml-1.5 break-all font-mono text-[10px] font-normal text-muted-foreground">
              {slot.type}
            </span>
          </p>
          <p className="break-words text-[11px] leading-snug text-muted-foreground">
            Used by: {slot.nodes.map((n) => n.nodeName).join(", ")}
          </p>
          {slot.suggestedName && (
            <p className="break-words text-[11px] leading-snug text-muted-foreground">
              Imported as: <span className="break-all text-foreground">{slot.suggestedName}</span>
            </p>
          )}
        </div>
        <Badge
          variant={status === "ok" ? "secondary" : "destructive"}
          className="shrink-0 text-[10px]"
        >
          {status === "ok" ? "OK" : status === "unmapped" ? "Map needed" : "Missing"}
        </Badge>
      </div>
      <CredentialPicker
        credentialType={slot.type}
        label="Local credential"
        value={mapped?.id ?? null}
        defaultName={slot.suggestedName}
        onChange={(cred) => {
          if (cred) onCreatedLocal(cred);
          onMap(cred);
        }}
      />
    </div>
  );
}
