import type { INodeExecutionData } from "../workflow/types";

export type AgentSpanStatus = "running" | "success" | "error";
export type AgentTurnPhase = "llm" | "tools" | "final";

export type AgentTraceToolCall = {
  id?: string;
  name: string;
  args: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  status?: AgentSpanStatus;
};

export type AgentTraceObservation = {
  tool: string;
  content: string;
};

export type AgentTraceTurn = {
  iteration: number;
  assistantText?: string;
  reasoning?: string;
  toolCalls: AgentTraceToolCall[];
  observations: AgentTraceObservation[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens?: number };
  startedAt?: string;
  llmFinishedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  status?: AgentSpanStatus;
  phase?: AgentTurnPhase;
  streaming?: boolean;
  lastTokenAt?: string;
};

export type AgentTrace = {
  turns: AgentTraceTurn[];
};

export type ExecutionNodeProgress = {
  iteration: number;
  maxIterations?: number;
  tool?: string;
  stepCount: number;
  lastObservation?: string;
  phase?: AgentTurnPhase | "tool";
  updatedAt?: string;
  streaming?: boolean;
  lastTokenAt?: string;
  chars?: number;
};

export const DELTA_THROTTLE_MS = 300;
export const DELTA_THROTTLE_CHARS = 80;

export function createDeltaThrottle(
  flush: () => void | Promise<void>,
  opts?: { ms?: number; chars?: number },
): { push: (totalChars: number) => void; flush: () => Promise<void> } {
  const ms = opts?.ms ?? DELTA_THROTTLE_MS;
  const chars = opts?.chars ?? DELTA_THROTTLE_CHARS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastFlushedChars = 0;
  let queuedChars = 0;
  let pending: Promise<void> = Promise.resolve();

  const runFlush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    lastFlushedChars = queuedChars;
    pending = pending.then(() => Promise.resolve(flush())).catch(() => undefined);
    return pending;
  };

  return {
    push(totalChars: number) {
      queuedChars = totalChars;
      if (totalChars - lastFlushedChars >= chars) {
        void runFlush();
        return;
      }
      if (!timer) {
        timer = setTimeout(() => {
          void runFlush();
        }, ms);
      }
    },
    async flush() {
      if (timer || queuedChars !== lastFlushedChars) {
        await runFlush();
        return;
      }
      await pending;
    },
  };
}

export const TRACE_TEXT_CAP = 4000;
export const PROGRESS_TEXT_CAP = 2000;

export function capText(value: string | undefined, max = TRACE_TEXT_CAP): string | undefined {
  if (value == null) return undefined;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function capTrace(trace: AgentTrace): AgentTrace {
  return {
    turns: trace.turns.map((turn) => ({
      ...turn,
      assistantText: capText(turn.assistantText),
      reasoning: capText(turn.reasoning),
      toolCalls: turn.toolCalls.map((call) => ({ ...call })),
      observations: turn.observations.map((obs) => ({
        tool: obs.tool,
        content: capText(obs.content) ?? "",
      })),
    })),
  };
}

export function usageFromResult(result: {
  usage?: unknown;
  [key: string]: unknown;
}): AgentTraceTurn["usage"] | undefined {
  const u = result.usage;
  if (!u || typeof u !== "object") return undefined;
  const uu = u as { promptTokens?: unknown; completionTokens?: unknown; totalTokens?: unknown };
  if (typeof uu.promptTokens !== "number" && typeof uu.completionTokens !== "number") {
    return undefined;
  }
  return {
    promptTokens: typeof uu.promptTokens === "number" ? uu.promptTokens : 0,
    completionTokens: typeof uu.completionTokens === "number" ? uu.completionTokens : 0,
    ...(typeof uu.totalTokens === "number" ? { totalTokens: uu.totalTokens } : {}),
  };
}

export function isAgentTrace(value: unknown): value is AgentTrace {
  return !!value && typeof value === "object" && Array.isArray((value as AgentTrace).turns);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function spanMs(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.max(0, b - a);
}

export function closeOpenSpans(turns: AgentTraceTurn[], status: AgentSpanStatus = "error"): void {
  const end = nowIso();
  for (const turn of turns) {
    if (turn.status === "running") {
      turn.status = status;
      turn.finishedAt = turn.finishedAt ?? end;
      turn.durationMs = spanMs(turn.startedAt, turn.finishedAt);
    }
    for (const call of turn.toolCalls) {
      if (call.status === "running") {
        call.status = status;
        call.finishedAt = call.finishedAt ?? end;
        call.durationMs = spanMs(call.startedAt, call.finishedAt);
      }
    }
  }
}

export class NodeExecutionError extends Error {
  items?: INodeExecutionData[][];
  trace?: AgentTrace;

  constructor(message: string, extras?: { items?: INodeExecutionData[][]; trace?: AgentTrace }) {
    super(message);
    this.name = "NodeExecutionError";
    this.items = extras?.items;
    this.trace = extras?.trace;
  }
}
