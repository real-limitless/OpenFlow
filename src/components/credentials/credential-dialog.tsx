import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface CredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentialType: string;
  onCreated: (credential: { id: string; name: string; type: string; createdAt: string }) => void;
}

export function CredentialDialog({
  open,
  onOpenChange,
  credentialType,
  onCreated,
}: CredentialDialogProps) {
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fieldDefs: Record<string, { key: string; label: string; type?: string }[]> = {
    httpBasicAuth: [
      { key: "user", label: "Username" },
      { key: "password", label: "Password", type: "password" },
    ],
    httpHeaderAuth: [
      { key: "name", label: "Header Name" },
      { key: "value", label: "Header Value", type: "password" },
    ],
    httpQueryAuth: [
      { key: "name", label: "Parameter Name" },
      { key: "value", label: "Parameter Value", type: "password" },
    ],
  };

  const defs = fieldDefs[credentialType] ?? [];

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type: credentialType,
          data: fields,
        }),
      });
      if (!res.ok) throw new Error("Failed to create credential");
      const credential = await res.json();
      onCreated(credential);
      toast.success("Credential created");
      onOpenChange(false);
      setName("");
      setFields({});
    } catch {
      toast.error("Failed to create credential");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Credential</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My API Key"
            />
          </div>
          {defs.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label>{f.label}</Label>
              <Input
                type={f.type ?? "text"}
                value={fields[f.key] ?? ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
