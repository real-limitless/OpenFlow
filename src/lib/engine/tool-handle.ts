import { resolve, sep } from "node:path";
import type { ExecutionContext, INodeExecutionData, NodeExecutor } from "@/sdk";

export interface ToolHandle {
  type: string;
  name: string;
  description?: string;
  schema?: unknown;
  inputSchema?: unknown;
  invoke(args: Record<string, unknown>): Promise<unknown> | unknown;
}

export function mergeToolArgs(
  params: Record<string, unknown>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return { ...params, ...args };
}

export function stringifyToolResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const r = result as { content?: unknown; isError?: boolean };
    if (typeof r.content === "string") {
      return r.isError ? `Error: ${r.content}` : r.content;
    }
    try {
      return JSON.stringify(result);
    } catch {
      return String(result);
    }
  }
  return String(result);
}

export function assertAllowUrl(ctx: ExecutionContext, url: string): void {
  if (ctx.allowUrl && !ctx.allowUrl(url)) {
    throw new Error(`HTTP Request blocked by allowUrl policy: ${url}`);
  }
}

export function emitToolHandle(ctx: ExecutionContext, handle: ToolHandle): INodeExecutionData[][] {
  const items = ctx.getInputItems(0);
  const pairedItem =
    items.length > 0 ? (items[0].pairedItem ?? { item: 0, input: 0 }) : { item: 0, input: 0 };
  return [[{ json: handle as unknown as Record<string, unknown>, pairedItem }]];
}

export function isClusterToolActivation(ctx: ExecutionContext): boolean {
  return ctx.getInputItems(0).length === 0;
}

export function resolveJailPath(fsRoot: string, requested: string): string {
  const root = resolve(fsRoot);
  const target = resolve(root, requested);
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(prefix)) {
    throw new Error(`Path escapes fsRoot: ${requested}`);
  }
  return target;
}

export function requireFsRoot(ctx: ExecutionContext): string {
  const root = ctx.fsRoot?.trim();
  if (!root) {
    throw new Error("Filesystem/Git tool requires createRuntime({ fsRoot })");
  }
  return root;
}

export function asHandleExecutor(
  type: string,
  name: string,
  description: string,
  schema: unknown,
  invoke: (ctx: ExecutionContext, args: Record<string, unknown>) => Promise<unknown>,
): NodeExecutor {
  return async (ctx) => {
    const handle: ToolHandle = {
      type,
      name,
      description: String(ctx.getParam("description", description) ?? description),
      schema,
      inputSchema: schema,
      invoke: (args) => invoke(ctx, args ?? {}),
    };
    return emitToolHandle(ctx, handle);
  };
}
