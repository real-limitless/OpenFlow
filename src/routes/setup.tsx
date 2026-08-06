import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OpenFlowLogo } from "@/components/brand/openflow-logo";
import { apiFetch, fetchSetupStatus, register } from "@/lib/auth/client";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "Create owner — OpenFlow" }] }),
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadTemplates, setLoadTemplates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await fetchSetupStatus();
      if (cancelled) return;
      if (status.authDisabled || !status.needsOwner) {
        navigate({ to: status.hasUsers ? "/login" : "/", search: status.hasUsers ? {} : undefined });
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await register(email.trim(), password);
      if (user.role !== "owner") {
        toast.message("Account created", {
          description: "Another owner already exists on this instance.",
        });
      } else {
        toast.success("Owner account created");
      }
      if (loadTemplates) {
        try {
          const res = await apiFetch("/api/v1/template-sources/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceId: "n8n-community" }),
          });
          if (res.ok) {
            toast.message("Loading template library in the background", {
              description:
                "Default: github.com/real-limitless/n8n-workflow-library — open Templates when ready.",
            });
          }
        } catch {
          /* non-fatal */
        }
      }
      navigate({ to: loadTemplates ? "/templates" : "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

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
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Create instance owner</h1>
          <p className="text-[13px] text-muted-foreground">
            This first account owns secret providers and admin settings. You can add more
            users later.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-[12px] leading-snug">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={loadTemplates}
            onChange={(e) => setLoadTemplates(e.target.checked)}
          />
          <span>
            <span className="font-medium text-foreground">
              Load community templates
            </span>
            <span className="mt-0.5 block text-muted-foreground">
              Sync{" "}
              <span className="text-foreground">n8n-workflow-library</span> into
              the marketplace after setup. You can add more repos later under
              Settings → Templates.
            </span>
          </span>
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create owner account"}
        </Button>
      </form>
    </div>
  );
}
