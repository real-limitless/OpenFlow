import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  buildCredentialData,
  getCredentialTypeDef,
  listCredentialTypes,
  type CredentialMeta,
} from "@/lib/credentials/types";
import { apiFetch } from "@/lib/auth/client";

interface CredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed type (picker) or omit to allow type selection (management page). */
  credentialType?: string;
  /** Pre-fill name (import flow). */
  defaultName?: string;
  /** When set, dialog updates this credential instead of creating. */
  edit?: CredentialMeta | null;
  onSaved: (credential: CredentialMeta) => void;
  /** @deprecated use onSaved */
  onCreated?: (credential: CredentialMeta) => void;
}

export function CredentialDialog({
  open,
  onOpenChange,
  credentialType: fixedType,
  defaultName = "",
  edit = null,
  onSaved,
  onCreated,
}: CredentialDialogProps) {
  const [type, setType] = useState(fixedType ?? edit?.type ?? "httpHeaderAuth");
  const [name, setName] = useState(defaultName || edit?.name || "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [externalRef, setExternalRef] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(fixedType ?? edit?.type ?? "httpHeaderAuth");
    setName(defaultName || edit?.name || "");
    setFields({});
    setProviderId(edit?.secretProviderId ?? "");
    setExternalRef(edit?.externalRef ?? "");
    void apiFetch("/api/v1/secret-providers")
      .then(async (r) => (r.ok ? ((await r.json()) as Array<{ id: string; name: string; type: string }>) : []))
      .then(setProviders)
      .catch(() => setProviders([]));
  }, [open, fixedType, defaultName, edit?.id, edit?.type, edit?.name, edit?.secretProviderId, edit?.externalRef]);

  const def = getCredentialTypeDef(type);
  const types = listCredentialTypes();
  const allowTypePick = !fixedType && !edit;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    let data: Record<string, unknown>;
    try {
      data = buildCredentialData(type, fields);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid credential data");
      return;
    }

    const hasSecrets = Object.keys(data).length > 0;
    if (!edit && !hasSecrets) {
      toast.error("Enter at least one credential field");
      return;
    }

    setSaving(true);
    try {
      const providerPayload = {
        secretProviderId: providerId || null,
        externalRef: externalRef.trim() || null,
      };
      if (edit) {
        const body: {
          name: string;
          data?: Record<string, unknown>;
          secretProviderId?: string | null;
          externalRef?: string | null;
        } = { name: name.trim(), ...providerPayload };
        if (hasSecrets) body.data = data;
        const res = await apiFetch(`/api/v1/credentials/${edit.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to update credential");
        const credential = (await res.json()) as CredentialMeta;
        onSaved(credential);
        onCreated?.(credential);
        toast.success("Credential updated");
      } else {
        const res = await apiFetch("/api/v1/credentials", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), type, data, ...providerPayload }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Failed to create credential");
        }
        const credential = (await res.json()) as CredentialMeta;
        onSaved(credential);
        onCreated?.(credential);
        toast.success("Credential created");
      }
      onOpenChange(false);
      setName("");
      setFields({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save credential");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? "Edit credential" : "New credential"}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Secrets are encrypted at rest. Values are never shown after save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {allowTypePick && (
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setFields({});
                }}
              >
                {types.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.displayName}
                  </option>
                ))}
                {!types.some((t) => t.name === type) && (
                  <option value={type}>{def.displayName}</option>
                )}
              </select>
            </div>
          )}

          {!allowTypePick && (
            <p className="text-[12px] text-muted-foreground">
              Type: <span className="font-medium text-foreground">{def.displayName}</span>
              <span className="ml-1 font-mono text-[11px]">({type})</span>
            </p>
          )}

          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My API Key"
            />
          </div>

          {edit && (
            <p className="text-[11px] text-muted-foreground">
              Leave secret fields blank to keep existing values. Fill any field to replace secrets.
            </p>
          )}

          {providers.length > 0 && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label>Secret store</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              >
                <option value="">Local (AES on server)</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
              {providerId && (
                <div className="space-y-1">
                  <Label className="text-[12px]">External path / ARN</Label>
                  <Input
                    className="font-mono text-[12px]"
                    placeholder="openflow/credentials/my-api"
                    value={externalRef}
                    onChange={(e) => setExternalRef(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {def.fields.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label>
                {f.label}
                {f.required && !edit ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </Label>
              {f.type === "textarea" ? (
                <Textarea
                  rows={5}
                  className="font-mono text-[12px]"
                  placeholder={f.placeholder}
                  value={fields[f.key] ?? ""}
                  onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "password" ? "password" : "text"}
                  placeholder={f.placeholder}
                  value={fields[f.key] ?? ""}
                  onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : edit ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
