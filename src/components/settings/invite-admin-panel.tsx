import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth/client";

type UserRow = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

type InviteRow = {
  id: string;
  email: string | null;
  role: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  pending: boolean;
  expired: boolean;
};

type Payload = {
  users: UserRow[];
  invites: InviteRow[];
  tryOut: boolean;
};

export function InviteAdminPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/v1/admin/users");
    if (!res.ok) return;
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invite = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/v1/admin/users/invite", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() || undefined, role }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        inviteUrl?: string;
        token?: string;
      };
      if (!res.ok) {
        toast.error(body.error ?? "Invite failed");
        return;
      }
      setLastUrl(body.inviteUrl ?? null);
      setEmail("");
      toast.success("Invite created — copy the link now");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const patchRole = async (id: string, next: string) => {
    const res = await apiFetch(`/api/v1/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Role change failed");
      return;
    }
    toast.success("Role updated");
    await refresh();
  };

  const revoke = async (id: string) => {
    const res = await apiFetch(`/api/v1/admin/users/invites/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not revoke invite");
      return;
    }
    toast.success("Invite revoked");
    await refresh();
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Users and invites</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Public registration closes after the owner exists. Admins send invite links; members join
          at <code className="rounded bg-muted px-1">/register?invite=…</code>. Disable an account
          to block sign-in.
        </p>
      </div>
      {data?.tryOut && (
        <p className="rounded-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Try-out mode (AUTH_DISABLED) treats this session as owner. Invite-only still applies when
          auth is enabled.
        </p>
      )}
      {data == null ? (
        <p className="text-[13px] text-muted-foreground">Loading users…</p>
      ) : (
        <>
          <ul className="space-y-2 text-[13px]">
            {data.users.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{u.email}</p>
                  <p className="text-muted-foreground">{u.role}</p>
                </div>
                <select
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  value={u.role}
                  onChange={(e) => void patchRole(u.id, e.target.value)}
                  aria-label={`Role for ${u.email}`}
                >
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                  <option value="disabled">disabled</option>
                </select>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Invite email (optional)</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as "member" | "admin")}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="button" disabled={busy} onClick={() => void invite()}>
                {busy ? "Creating…" : "Create invite"}
              </Button>
            </div>
          </div>
          {lastUrl && (
            <p className="break-all rounded-md bg-muted px-3 py-2 text-[12px] text-foreground">
              {lastUrl}
            </p>
          )}
          {data.invites.length > 0 && (
            <ul className="space-y-2 text-[13px]">
              {data.invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    {inv.email ?? "any email"} · {inv.role} ·{" "}
                    {inv.usedAt ? "used" : inv.expired ? "expired" : "pending"}
                  </span>
                  {!inv.usedAt && (
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-0.5 text-xs"
                      onClick={() => void revoke(inv.id)}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
