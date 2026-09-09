import type { OpenRouterCompletionResult, OpenRouterToolCall } from "./lm-chat-open-router";
export type OpenRouterStreamDelta = {
    text: string;
    reasoning?: string;
    toolCalls?: OpenRouterToolCall[];
};
export declare class OpenRouterStreamSilentError extends Error {
    constructor(message: string);
}
export declare function looksLikeSse(body: unknown): body is string;
export declare function looksLikeChatCompletion(body: unknown): boolean;
export declare function isStreamRejected(status: number, body: unknown): boolean;
export declare function parseSseDataPayloads(chunk: string): unknown[];
export declare function iterateByteStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string>;
export declare function iterateSseText(text: string): AsyncGenerator<string>;
export declare function consumeOpenRouterSse(chunks: AsyncIterable<string>, opts?: {
    firstChunkMs?: number;
    gapMs?: number;
    onDelta?: (delta: OpenRouterStreamDelta) => void;
}): Promise<OpenRouterCompletionResult>;
