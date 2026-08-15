import type { INodeExecutionData } from "../workflow/types";

export type AgentTraceToolCall = {
  id?: string;
  name: string;
  args: Record<string, unknown>;
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
};

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
      observations: turn.observations.map((obs) => ({
        tool: obs.tool,
        content: capText(obs.content) ?? "",
      })),
    })),
  };
}

export function usageFromResult(result: { usage?: unknown }): AgentTraceTurn["usage"] | undefined {
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
