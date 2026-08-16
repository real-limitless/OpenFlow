import { closeOpenSpans, type AgentTrace, type ExecutionNodeProgress } from "./agent-trace";

export const STREAM_FIRST_CHUNK_MS = 60_000;
export const STREAM_GAP_MS = 45_000;
export const STREAM_SILENT_WARN_MS = 15_000;

export const STALE_LLM_MESSAGE = "Model stream went silent";

type RunEntry = {
  status?: string;
  progress?: ExecutionNodeProgress;
  trace?: AgentTrace;
  error?: string;
};

function runningTurn(trace?: AgentTrace) {
  return trace?.turns.find((t) => t.status === "running");
}

function llmPhase(entry: RunEntry): boolean {
  const phase = entry.progress?.phase ?? runningTurn(entry.trace)?.phase;
  return phase === "llm";
}

function clockIso(entry: RunEntry, fallbackIso: string): { at: string; hadToken: boolean } {
  const lastTokenAt = entry.progress?.lastTokenAt ?? runningTurn(entry.trace)?.lastTokenAt;
  if (lastTokenAt) return { at: lastTokenAt, hadToken: true };
  const started = entry.progress?.updatedAt ?? runningTurn(entry.trace)?.startedAt ?? fallbackIso;
  return { at: started, hadToken: false };
}

export function inspectStaleLlm(
  runData: unknown,
  fallbackIso: string,
  nowMs = Date.now(),
): { stale: false } | { stale: true; nodeName: string; message: string } {
  if (!runData || typeof runData !== "object") return { stale: false };
  for (const [nodeName, raw] of Object.entries(runData as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as RunEntry;
    if (entry.status && entry.status !== "running") continue;
    if (!llmPhase(entry)) continue;
    const { at, hadToken } = clockIso(entry, fallbackIso);
    const ts = Date.parse(at);
    if (!Number.isFinite(ts)) continue;
    const limit = hadToken ? STREAM_GAP_MS : STREAM_FIRST_CHUNK_MS;
    if (nowMs - ts > limit) {
      return {
        stale: true,
        nodeName,
        message: hadToken
          ? `${STALE_LLM_MESSAGE}: no tokens for ${Math.round(STREAM_GAP_MS / 1000)}s`
          : `${STALE_LLM_MESSAGE}: no tokens in ${Math.round(STREAM_FIRST_CHUNK_MS / 1000)}s`,
      };
    }
  }
  return { stale: false };
}

export function applyStaleLlmFailure(runData: unknown, message: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!runData || typeof runData !== "object") return out;
  for (const [name, raw] of Object.entries(runData as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") {
      out[name] = raw;
      continue;
    }
    const entry = { ...(raw as RunEntry) };
    if (llmPhase(entry)) {
      entry.status = "error";
      entry.error = message;
      if (entry.trace?.turns) closeOpenSpans(entry.trace.turns, "error");
    }
    out[name] = entry;
  }
  return out;
}
