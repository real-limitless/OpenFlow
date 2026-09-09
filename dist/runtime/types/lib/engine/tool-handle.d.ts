import type { ExecutionContext, INodeExecutionData, NodeExecutor } from "@/sdk";
export interface ToolHandle {
    type: string;
    name: string;
    description?: string;
    schema?: unknown;
    inputSchema?: unknown;
    invoke(args: Record<string, unknown>): Promise<unknown> | unknown;
}
export interface McpToolDescriptor {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}
export declare function mergeToolArgs(params: Record<string, unknown>, args: Record<string, unknown>): Record<string, unknown>;
export declare function stringifyToolResult(result: unknown): string;
export declare function assertAllowUrl(ctx: ExecutionContext, url: string): void;
export declare function emitToolHandle(ctx: ExecutionContext, handle: ToolHandle): INodeExecutionData[][];
/** MCP-shaped bundle so the agent expands every tool (must not set top-level `name`). */
export declare function emitMcpBundle(ctx: ExecutionContext, bundle: {
    type?: string;
    tools: McpToolDescriptor[];
    invoke: (toolName: string, args: Record<string, unknown>) => Promise<unknown> | unknown;
}): INodeExecutionData[][];
export declare function isClusterToolActivation(ctx: ExecutionContext): boolean;
export declare function resolveJailPath(fsRoot: string, requested: string): string;
export declare function requireFsRoot(ctx: ExecutionContext): string;
export declare function asHandleExecutor(type: string, name: string, description: string, schema: unknown, invoke: (ctx: ExecutionContext, args: Record<string, unknown>) => Promise<unknown>): NodeExecutor;
