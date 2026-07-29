import { useState, useEffect } from "react";
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

interface Credential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

interface CredentialPickerProps {
  credentialType: string;
  label: string;
  value?: string;
  onChange: (credentialId: string | null) => void;
}

export function CredentialPicker({
  credentialType,
  label,
  value,
  onChange,
}: CredentialPickerProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/credentials");
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.filter((c: Credential) => c.type === credentialType));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, [credentialType]);

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder={loading ? "Loading..." : "Select credential"} />
          </SelectTrigger>
          <SelectContent>
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
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <CredentialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        credentialType={credentialType}
        onCreated={(newCred) => {
          setCredentials((prev) => [...prev, newCred]);
          onChange(newCred.id);
        }}
      />
    </div>
  );
}
