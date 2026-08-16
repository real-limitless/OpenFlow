import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  isAgentTrace,
  type AgentTrace,
  type AgentTraceTurn,
  type ExecutionNodeProgress,
} from "@/lib/engine/agent-trace";
import { STREAM_SILENT_WARN_MS } from "@/lib/engine/llm-silence";
import { formatDuration } from "./status-styles";

type IntermediateStep = {
  action?: { tool?: string; toolInput?: Record<string, unknown> };
  observation?: string;
};

function turnsFromSteps(steps: IntermediateStep[]): AgentTrace["turns"] {
  return steps.map((step, i) => ({
    iteration: i,
    toolCalls: [
      {
        name: String(step.action?.tool ?? "tool"),
        args: step.action?.toolInput ?? {},
      },
    ],
    observations: step.observation
      ? [{ tool: String(step.action?.tool ?? "tool"), content: step.observation }]
      : [],
  }));
}

export function extractAgentView(source: unknown): {
  trace?: AgentTrace;
  intermediateSteps?: IntermediateStep[];
  output?: unknown;
  progress?: ExecutionNodeProgress;
} {
  if (!source || typeof source !== "object") return {};
  const rec = source as Record<string, unknown>;
  const items = rec.items as Array<Array<{ json?: Record<string, unknown> }>> | undefined;
  const firstJson = items?.[0]?.[0]?.json;
  const itemTrace =
    firstJson && isAgentTrace(firstJson.agentTrace) ? firstJson.agentTrace : undefined;
  const selfTrace = isAgentTrace(rec.agentTrace) ? rec.agentTrace : undefined;
  const nodeTrace = isAgentTrace(rec.trace) ? rec.trace : undefined;
  const steps = firstJson?.intermediateSteps ?? rec.intermediateSteps;
  return {
    trace: nodeTrace ?? itemTrace ?? selfTrace,
    intermediateSteps: Array.isArray(steps) ? (steps as IntermediateStep[]) : undefined,
    output: firstJson?.output,
    progress: rec.progress as ExecutionNodeProgress | undefined,
  };
}

function preview(value: unknown, max = 280): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function liveDuration(
  startedAt?: string,
  finishedAt?: string,
  durationMs?: number,
  now = Date.now(),
) {
  if (durationMs != null) return durationMs;
  if (finishedAt && startedAt) {
    const a = Date.parse(startedAt);
    const b = Date.parse(finishedAt);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(0, b - a);
  }
  if (startedAt) {
    const a = Date.parse(startedAt);
    if (Number.isFinite(a)) return Math.max(0, now - a);
  }
  return undefined;
}

function phaseLabel(turn: AgentTraceTurn): string {
  if (turn.phase === "llm") return "thinking";
  if (turn.phase === "tools") return "tools";
  if (turn.phase === "final") return "answer";
  return turn.status === "running" ? "running" : "";
}

export function AgentTraceView({
  trace,
  intermediateSteps,
  output,
  progress,
}: {
  trace?: AgentTrace | null;
  intermediateSteps?: IntermediateStep[];
  output?: unknown;
  progress?: ExecutionNodeProgress | null;
}) {
  const turns = trace?.turns?.length ? trace.turns : turnsFromSteps(intermediateSteps ?? []);
  const live =
    turns.some((t) => t.status === "running") ||
    turns.some((t) => t.toolCalls.some((c) => c.status === "running"));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [live]);

  if (!turns.length && !progress) return null;

  return (
    <div className="space-y-2">
      {progress && (
        <p className="rounded border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
          Turn {progress.iteration + 1}
          {progress.maxIterations != null ? ` / ${progress.maxIterations}` : ""}
          {progress.phase ? ` · ${progress.phase}` : ""}
          {progress.tool ? ` · ${progress.tool}` : ""}
          {progress.stepCount
            ? ` · ${progress.stepCount} step${progress.stepCount === 1 ? "" : "s"}`
            : ""}
          {progress.lastObservation ? ` · ${preview(progress.lastObservation, 120)}` : ""}
          {progress.streaming && progress.chars != null ? ` · ${progress.chars} chars` : ""}
        </p>
      )}
      {turns.map((turn) => {
        const dur = liveDuration(turn.startedAt, turn.finishedAt, turn.durationMs, now);
        const chars = (turn.assistantText?.length ?? 0) + (turn.reasoning?.length ?? 0);
        const lastTokenAt = turn.lastTokenAt ?? progress?.lastTokenAt;
        const lastTokenMs = lastTokenAt ? Date.parse(lastTokenAt) : NaN;
        const agoSec = Number.isFinite(lastTokenMs)
          ? Math.max(0, Math.round((now - lastTokenMs) / 1000))
          : undefined;
        const stalled =
          turn.status === "running" &&
          turn.phase === "llm" &&
          agoSec != null &&
          agoSec * 1000 >= STREAM_SILENT_WARN_MS;
        return (
          <div
            key={turn.iteration}
            className={`rounded border px-2 py-1.5 ${
              turn.status === "running" ? "border-blue-500/50 bg-blue-500/5" : "border-border/60"
            }`}
          >
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Turn {turn.iteration + 1}
              {phaseLabel(turn) ? ` · ${phaseLabel(turn)}` : ""}
              {dur != null ? ` · ${formatDuration(dur)}` : ""}
              {turn.usage
                ? ` · ${turn.usage.promptTokens}/${turn.usage.completionTokens} tokens`
                : ""}
              {turn.status === "running" && turn.phase === "llm"
                ? ` · streaming · ${chars} chars${agoSec != null ? ` · last token ${agoSec}s ago` : ""}`
                : ""}
              {stalled ? " · stream looks stalled" : ""}
            </div>
            {turn.reasoning ? (
              <Collapsible defaultOpen={turn.status === "running"}>
                <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  Reasoning
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                    {turn.reasoning}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            {turn.assistantText ? (
              <p className="whitespace-pre-wrap break-words text-[12px]">{turn.assistantText}</p>
            ) : turn.status === "running" && turn.phase === "llm" ? (
              <p className="animate-pulse text-[12px] text-muted-foreground">Thinking…</p>
            ) : null}
            {turn.toolCalls.map((call, i) => {
              const toolDur = liveDuration(call.startedAt, call.finishedAt, call.durationMs, now);
              return (
                <div key={`${call.name}-${i}`} className="mt-1 font-mono text-[11px]">
                  <span className="text-muted-foreground">{call.name}</span>{" "}
                  <span>{preview(call.args, 160)}</span>
                  {call.status === "running" ? (
                    <span className="ml-1 animate-pulse text-blue-500">
                      running{toolDur != null ? ` · ${formatDuration(toolDur)}` : ""}
                    </span>
                  ) : toolDur != null ? (
                    <span className="ml-1 text-muted-foreground">{formatDuration(toolDur)}</span>
                  ) : null}
                  {turn.observations[i] ? (
                    <div className="pl-3 text-muted-foreground">
                      → {preview(turn.observations[i].content)}
                    </div>
                  ) : call.status === "running" ? (
                    <div className="pl-3 animate-pulse text-muted-foreground">waiting…</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
      {output != null && turns.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">Output: {preview(output, 200)}</p>
      ) : null}
    </div>
  );
}

export function AgentTraceBlock({ source }: { source: unknown }) {
  const view = extractAgentView(source);
  const [rawOpen, setRawOpen] = useState(false);
  if (!view.trace && !view.intermediateSteps?.length && !view.progress) return null;
  return (
    <div className="space-y-2">
      <AgentTraceView {...view} />
      <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          {rawOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Raw JSON
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
            {JSON.stringify(source, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
