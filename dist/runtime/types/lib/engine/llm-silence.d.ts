export declare const STREAM_FIRST_CHUNK_MS = 60000;
export declare const STREAM_GAP_MS = 45000;
export declare const STREAM_SILENT_WARN_MS = 15000;
export declare const STALE_LLM_MESSAGE = "Model stream went silent";
export declare function inspectStaleLlm(runData: unknown, fallbackIso: string, nowMs?: number): {
    stale: false;
} | {
    stale: true;
    nodeName: string;
    message: string;
};
export declare function applyStaleLlmFailure(runData: unknown, message: string): Record<string, unknown>;
