import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/auth/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ShareRow = {
  id: string;
  permission: string;
  granteeUserEmail: string | null;
  granteeProjectName: string | null;
  expiresAt: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: "workflow" | "credential";
  resourceId: string;
  resourceName: string;
};

export function ShareDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceName,
}: Props) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState(resourceType === "credential" ? "use" : "view");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await apiFetch(
      `/api/v1/shares?resourceType=${resourceType}&resourceId=${encodeURIComponent(resourceId)}`,
    );
    if (!res.ok) {
      if (res.status === 403) toast.error("You cannot manage shares for this resource");
      setShares([]);
      return;
    }
    setShares((await res.json()) as ShareRow[]);
  }, [resourceType, resourceId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const add = async () => {
    if (!email.trim()) {
      toast.error("Email required");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/v1/shares", {
        method: "POST",
        body: JSON.stringify({
          resourceType,
          resourceId,
          permission,
          email: email.trim(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Share failed");
        return;
      }
      toast.success("Shared");
      setEmail("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    const res = await apiFetch(`/api/v1/shares/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not revoke share");
      return;
    }
    toast.success("Share revoked");
    await refresh();
  };

  const permOptions =
    resourceType === "credential"
      ? [
          { value: "use", label: "Use (runtime only)" },
          { value: "view", label: "View metadata" },
        ]
      : [
          { value: "view", label: "View" },
          { value: "edit", label: "Edit" },
        ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" />
            Share “{resourceName}”
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="share-email">User email</Label>
            <Input
              id="share-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Permission</Label>
            <Select value={permission} onValueChange={setPermission}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {permOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {resourceType === "credential" && (
              <p className="text-[12px] text-muted-foreground">
                Use lets them run workflows with this secret without seeing its values.
              </p>
            )}
          </div>
          <Button onClick={() => void add()} disabled={busy} className="w-full">
            Add share
          </Button>
        </div>

        <div className="mt-2 border-t border-border pt-3">
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">Current shares</p>
          {shares.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">None yet.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {shares.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {s.granteeUserEmail ?? s.granteeProjectName ?? "—"}
                    <span className="ml-1.5 text-muted-foreground">· {s.permission}</span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => void revoke(s.id)}
                    aria-label="Revoke"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
