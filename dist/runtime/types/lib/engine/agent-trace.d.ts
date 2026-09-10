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
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens?: number;
    };
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
export declare const DELTA_THROTTLE_MS = 300;
export declare const DELTA_THROTTLE_CHARS = 80;
export declare function createDeltaThrottle(flush: () => void | Promise<void>, opts?: {
    ms?: number;
    chars?: number;
}): {
    push: (totalChars: number) => void;
    flush: () => Promise<void>;
};
export declare const TRACE_TEXT_CAP = 4000;
export declare const PROGRESS_TEXT_CAP = 2000;
export declare function capText(value: string | undefined, max?: number): string | undefined;
export declare function capTrace(trace: AgentTrace): AgentTrace;
export declare function usageFromResult(result: {
    usage?: unknown;
    [key: string]: unknown;
}): AgentTraceTurn["usage"] | undefined;
export declare function isAgentTrace(value: unknown): value is AgentTrace;
export declare function nowIso(): string;
export declare function spanMs(start?: string, end?: string): number | undefined;
export declare function closeOpenSpans(turns: AgentTraceTurn[], status?: AgentSpanStatus): void;
export declare class NodeExecutionError extends Error {
    items?: INodeExecutionData[][];
    trace?: AgentTrace;
    constructor(message: string, extras?: {
        items?: INodeExecutionData[][];
        trace?: AgentTrace;
    });
}
