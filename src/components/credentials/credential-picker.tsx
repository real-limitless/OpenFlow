import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { CredentialDialog } from "./credential-dialog";
import type { CredentialMeta } from "@/lib/credentials/types";
import { getCredentialTypeDef } from "@/lib/credentials/types";

interface CredentialPickerProps {
  credentialType: string;
  label?: string;
  value?: string | null;
  defaultName?: string;
  required?: boolean;
  onChange: (credential: CredentialMeta | null) => void;
}

export function CredentialPicker({
  credentialType,
  label,
  value,
  defaultName,
  required,
  onChange,
}: CredentialPickerProps) {
  const [credentials, setCredentials] = useState<CredentialMeta[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const def = getCredentialTypeDef(credentialType);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/credentials");
      if (res.ok) {
        const data = (await res.json()) as CredentialMeta[];
        setCredentials(data.filter((c) => c.type === credentialType));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [credentialType]);

  useEffect(() => {
    void fetchCredentials();
  }, [fetchCredentials]);

  return (
    <div className="space-y-1.5">
      <Label className="text-[13px]">
        {label ?? def.displayName}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <div className="flex gap-2">
        <Select
          value={value ?? ""}
          onValueChange={(v) => {
            if (!v) {
              onChange(null);
              return;
            }
            const hit = credentials.find((c) => c.id === v) ?? null;
            onChange(hit);
          }}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder={loading ? "Loading…" : "Select credential"} />
          </SelectTrigger>
          <SelectContent>
            {credentials.length === 0 && (
              <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
                No {def.displayName} credentials yet
              </div>
            )}
            {credentials.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setDialogOpen(true)}
          type="button"
          title="Create credential"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <CredentialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        credentialType={credentialType}
        defaultName={defaultName}
        onSaved={(newCred) => {
          setCredentials((prev) => {
            if (prev.some((c) => c.id === newCred.id)) {
              return prev.map((c) => (c.id === newCred.id ? newCred : c));
            }
            return [...prev, newCred];
          });
          onChange(newCred);
        }}
      />
    </div>
  );
}
