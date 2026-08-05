import { Link } from "@tanstack/react-router";
import { Check, Play, Plus, Sparkles, Store, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "@/lib/onboarding/state";

type Props = {
  state: OnboardingState;
  empty: boolean;
  busySample: boolean;
  onRunSample: () => void;
  onNewBlank: () => void;
  onImport: () => void;
  onDismiss: () => void;
};

export function WelcomePanel({
  state,
  empty,
  busySample,
  onRunSample,
  onNewBlank,
  onImport,
  onDismiss,
}: Props) {
  const steps = [
    {
      id: "sample",
      label: "Start from the sample workflow",
      done: state.sampleCreated,
    },
    {
      id: "run",
      label: "Execute it once (HTTP + branch demo)",
      done: state.firstRunSuccess,
    },
    {
      id: "explore",
      label: "Explore templates or add credentials",
      done: Boolean(state.completedAt),
      optional: true,
    },
  ] as const;

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative border-b border-border bg-primary/5 px-6 py-8">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-background/80 hover:text-foreground"
          aria-label="Dismiss welcome"
        >
          <X className="size-4" />
        </button>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Getting started
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          {empty ? "Welcome to OpenFlow" : "Finish your first run"}
        </h2>
        <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
          {empty
            ? "Create a blank canvas, import JSON, or run the sample workflow — no credentials required."
            : "Open the sample and hit Execute to complete onboarding."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onRunSample} disabled={busySample}>
            <Sparkles className="mr-1 size-4" />
            {busySample ? "Creating…" : "Run sample workflow"}
          </Button>
          <Button variant="outline" onClick={onNewBlank}>
            <Plus className="mr-1 size-4" /> New blank
          </Button>
          <Button variant="outline" onClick={onImport}>
            <Upload className="mr-1 size-4" /> Import JSON
          </Button>
          <Button variant="outline" asChild>
            <Link to="/templates" search={{}}>
              <Store className="mr-1 size-4" /> Browse templates
            </Link>
          </Button>
        </div>
      </div>

      <ol className="divide-y divide-border">
        {steps.map((step, i) => (
          <li key={step.id} className="flex items-center gap-3 px-6 py-3">
            <span
              className={
                step.done
                  ? "flex size-6 items-center justify-center rounded-full bg-[var(--success)]/15 text-[var(--success)]"
                  : "flex size-6 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground"
              }
            >
              {step.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={`flex-1 text-[13px] ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {step.label}
              {"optional" in step && step.optional ? (
                <span className="ml-1.5 text-[11px] text-muted-foreground">(optional)</span>
              ) : null}
            </span>
            {step.id === "sample" && !step.done && (
              <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={onRunSample}>
                <Play className="mr-1 size-3" /> Start
              </Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
