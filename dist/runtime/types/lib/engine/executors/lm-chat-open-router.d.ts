import type { NodeExecutor } from "@/sdk";
import { type SdkHttpRequestOptions, type SdkHttpResponse } from "@/sdk";
import { type OpenRouterStreamDelta } from "./openrouter-sse";
export interface OpenRouterChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }>;
    name?: string;
}
export interface OpenRouterToolCall {
    id?: string;
    name: string;
    args: Record<string, unknown>;
}
export interface OpenRouterAgentToolDef {
    name: string;
    description?: string;
    schema?: unknown;
    parameters?: unknown;
}
export interface OpenRouterCompletionResult {
    text: string;
    model: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    toolCalls?: OpenRouterToolCall[];
    reasoning?: string;
}
export type OpenRouterInvokeOptions = {
    onDelta?: (delta: OpenRouterStreamDelta) => void;
};
export interface OpenRouterModelHandle {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter";
    model: string;
    options: Record<string, unknown>;
    baseUrl: string;
    invoke(messages: OpenRouterChatMessage[], tools?: OpenRouterAgentToolDef[] | unknown[], opts?: OpenRouterInvokeOptions): Promise<OpenRouterCompletionResult>;
}
export type OpenRouterHttpClient = (options: SdkHttpRequestOptions) => Promise<SdkHttpResponse>;
export declare function setOpenRouterHttpClient(factory: OpenRouterHttpClient | null): void;
export declare const lmChatOpenRouterExecutor: NodeExecutor;
