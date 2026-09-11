import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OpenFlowLogo } from "@/components/brand/openflow-logo";
import { fetchSetupStatus, register } from "@/lib/auth/client";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Register — OpenFlow" }] }),
  component: RegisterPage,
  validateSearch: (s: Record<string, unknown>) => ({
    invite: typeof s.invite === "string" ? s.invite : undefined,
  }),
});

function RegisterPage() {
  const navigate = useNavigate();
  const { invite } = Route.useSearch();
  const navigateToHome = () => navigate({ to: "/" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [tryOut, setTryOut] = useState(false);
  const [checking, setChecking] = useState(true);
  const hasInvite = Boolean(invite?.trim());
  const formClosed = inviteOnly && !hasInvite;

  useEffect(() => {
    let cancelled = false;
    void fetchSetupStatus().then((status) => {
      if (cancelled) return;
      setTryOut(Boolean(status.tryOut || status.authDisabled));
      setInviteOnly(Boolean(status.inviteOnly));
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formClosed) return;
    setBusy(true);
    try {
      await register(email.trim(), password, invite?.trim());
      toast.success("Account created");
      navigateToHome();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 flex items-center gap-2 text-primary">
        <OpenFlowLogo className="size-7" withPlate />
        <span className="font-mono text-[15px] font-semibold text-foreground">OpenFlow</span>
      </div>
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6"
      >
        <h1 className="text-lg font-semibold tracking-tight">Create account</h1>
        {tryOut && (
          <p className="rounded-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
            Try-out mode is on (AUTH_DISABLED). Accounts are not required.
          </p>
        )}
        {hasInvite ? (
          <p className="text-[13px] text-muted-foreground">
            You have an invite link. Create your account with the invited email if the invite is
            pinned to one address.
          </p>
        ) : inviteOnly ? (
          <p className="text-[13px] text-muted-foreground">
            Public registration is closed. This instance is invite-only after the owner exists.
            Sign in, or ask an owner to send an invite link.
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            New instance? Use{" "}
            <Link to="/setup" className="text-primary hover:underline">
              first-time setup
            </Link>{" "}
            to create the owner account.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            disabled={formClosed}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password (min 8)</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            disabled={formClosed}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || formClosed || checking}>
          {formClosed ? "Registration closed" : busy ? "Creating…" : "Register"}
        </Button>
        <p className="text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" search={{}} className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
