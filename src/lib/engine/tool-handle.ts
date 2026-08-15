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

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export function mergeToolArgs(
  params: Record<string, unknown>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return { ...params, ...args };
}

export function emitToolHandle(ctx: ExecutionContext, handle: ToolHandle): INodeExecutionData[][] {
  const items = ctx.getInputItems(0);
  const pairedItem =
    items.length > 0 ? (items[0].pairedItem ?? { item: 0, input: 0 }) : { item: 0, input: 0 };
  return [[{ json: handle as unknown as Record<string, unknown>, pairedItem }]];
}

/** MCP-shaped bundle so the agent expands every tool (must not set top-level `name`). */
export function emitMcpBundle(
  ctx: ExecutionContext,
  bundle: {
    type?: string;
    tools: McpToolDescriptor[];
    invoke: (toolName: string, args: Record<string, unknown>) => Promise<unknown> | unknown;
  },
): INodeExecutionData[][] {
  const items = ctx.getInputItems(0);
  const pairedItem =
    items.length > 0 ? (items[0].pairedItem ?? { item: 0, input: 0 }) : { item: 0, input: 0 };
  return [
    [
      {
        json: {
          type: bundle.type ?? "openflow-node-langchain.mcpClientTool",
          tools: bundle.tools,
          invoke: bundle.invoke,
        } as unknown as Record<string, unknown>,
        pairedItem,
      },
    ],
  ];
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
  const fromParam = String(ctx.getParam("fsRoot", "") ?? "").trim();
  if (fromParam) return resolve(fromParam);
  const env = process.env.OPENFLOW_FS_ROOT?.trim();
  if (env) return resolve(env);
  return process.cwd();
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
