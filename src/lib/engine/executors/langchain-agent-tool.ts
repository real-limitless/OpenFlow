import type { NodeExecutor, INodeExecutionData, ExecutionContext, IWorkflow } from "@/sdk";
import {
  capTrace,
  NodeExecutionError,
  usageFromResult,
  type AgentTrace,
  type AgentTraceTurn,
} from "../agent-trace";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

interface ModelInvokeResult {
  text: string;
  toolCalls?: ToolCall[];
  [key: string]: unknown;
}

interface ModelHandle {
  type?: string;
  model?: string;
  invoke(messages: ChatMessage[], tools?: unknown[]): Promise<ModelInvokeResult>;
}

interface ToolHandle {
  name: string;
  description?: string;
  schema?: unknown;
  invoke?(args: Record<string, unknown>): Promise<string> | string;
}

interface MemoryHandle {
  loadMessages?(): ChatMessage[];
  appendTurn?(user: ChatMessage, assistant: ChatMessage): void;
  saveMessages?(messages: ChatMessage[]): void;
  [key: string]: unknown;
}

interface OutputParserHandle {
  parse?(text: string): unknown;
  [key: string]: unknown;
}

interface SubNodeRef {
  name: string;
  index: number;
}

interface ConnectedSubNodes {
  languageModels: SubNodeRef[];
  tools: SubNodeRef[];
  memory: SubNodeRef[];
  outputParser: SubNodeRef[];
}

export interface AgentToolHandle {
  type: "@n8n/n8n-nodes-langchain.agentTool";
  name: string;
  description: string;
  invoke(args: Record<string, unknown>): Promise<string>;
  agentTrace?: AgentTrace;
}

function findConnectedSubNodes(
  connections: IWorkflow["connections"],
  agentName: string,
): ConnectedSubNodes {
  const subs: ConnectedSubNodes = {
    languageModels: [],
    tools: [],
    memory: [],
    outputParser: [],
  };
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (!t || t.node !== agentName) continue;
          const ref: SubNodeRef = { name: sourceName, index: t.index ?? 0 };
          switch (t.type) {
            case "ai_languageModel":
              subs.languageModels.push(ref);
              break;
            case "ai_tool":
              subs.tools.push(ref);
              break;
            case "ai_memory":
              subs.memory.push(ref);
              break;
            case "ai_outputParser":
              subs.outputParser.push(ref);
              break;
          }
        }
      }
    }
  }
  subs.languageModels.sort((a, b) => a.index - b.index);
  return subs;
}

function getModelHandle(ctx: ExecutionContext, name: string): ModelHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  const json = items[0].json;
  if (json && typeof (json as { invoke?: unknown }).invoke === "function") {
    return json as unknown as ModelHandle;
  }
  return null;
}

function getToolHandles(ctx: ExecutionContext, names: string[]): ToolHandle[] {
  const handles: ToolHandle[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const items = ctx.getNodeInputItems(name, 0);
    if (!items || items.length === 0) continue;
    for (const item of items) {
      const json = item.json;
      if (!json || typeof json !== "object") continue;
      const j = json as Record<string, unknown>;
      if (typeof j.name === "string") {
        if (seen.has(j.name as string)) continue;
        seen.add(j.name as string);
        handles.push(j as unknown as ToolHandle);
      }
      const bundle = j as { tools?: unknown[]; invoke?: unknown };
      if (Array.isArray(bundle.tools) && typeof bundle.invoke === "function") {
        for (const t of bundle.tools) {
          const td = t as { name?: string };
          if (!td || !td.name || seen.has(td.name)) continue;
          seen.add(td.name);
          const invokeFn = bundle.invoke.bind(bundle);
          handles.push({
            name: td.name,
            description: (t as { description?: string }).description,
            schema: (t as { inputSchema?: unknown }).inputSchema,
            async invoke(args: Record<string, unknown>): Promise<string> {
              const result = await invokeFn(td.name, args ?? {});
              if (result == null) return "";
              if (typeof result === "string") return result;
              const r = result as { content?: unknown; isError?: boolean };
              if (typeof r.content === "string")
                return r.isError ? `Error: ${r.content}` : r.content;
              try {
                return JSON.stringify(result);
              } catch {
                return String(result);
              }
            },
          });
        }
      }
    }
  }
  return handles;
}

function getMemoryHandle(ctx: ExecutionContext, name: string): MemoryHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as MemoryHandle;
}

function getOutputParserHandle(ctx: ExecutionContext, name: string): OutputParserHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as OutputParserHandle;
}

function toolCallId(call: ToolCall, index: number): string {
  if (call.id && typeof call.id === "string" && call.id.length > 0) return call.id;
  return `call_${call.name}_${index}`;
}

async function runNestedAgent(
  ctx: ExecutionContext,
  nodeName: string,
): Promise<{ output: string; trace: AgentTrace }> {
  const workflow = ctx.getWorkflow();
  const subs = findConnectedSubNodes(workflow.connections, nodeName);

  if (subs.languageModels.length === 0) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  const primaryModel = getModelHandle(ctx, subs.languageModels[0].name);
  if (!primaryModel) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  const needsFallback = ctx.getParam<boolean>("needsFallback", false);
  const fallbackModel =
    needsFallback && subs.languageModels.length > 1
      ? getModelHandle(ctx, subs.languageModels[1].name)
      : null;

  const hasOutputParser = ctx.getParam<boolean>("hasOutputParser", false);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const maxIterationsRaw = options.maxIterations;
  const maxIterations =
    typeof maxIterationsRaw === "number" && maxIterationsRaw > 0 ? maxIterationsRaw : 10;

  const toolHandles = getToolHandles(
    ctx,
    subs.tools.map((t) => t.name),
  );
  const toolDefs = toolHandles.map((t) => ({
    name: t.name,
    description: t.description,
    schema: t.schema,
  }));

  const memoryHandle = subs.memory.length > 0 ? getMemoryHandle(ctx, subs.memory[0].name) : null;
  const parserHandle =
    hasOutputParser && subs.outputParser.length > 0
      ? getOutputParserHandle(ctx, subs.outputParser[0].name)
      : null;

  const inputItems = ctx.getInputItems(0);
  const firstItem = inputItems && inputItems.length > 0 ? inputItems[0] : null;
  const itemJson = firstItem?.json ?? {};

  const text = ctx.getParam<unknown>("text", "");
  const prompt =
    text != null
      ? String(ctx.evaluate(typeof text === "string" ? text : String(text), itemJson) ?? "")
      : "";
  if (!prompt) {
    throw new Error("No prompt specified");
  }

  const systemMessageRaw = options.systemMessage;
  const systemMessage =
    systemMessageRaw != null && typeof systemMessageRaw === "string"
      ? String(ctx.evaluate(systemMessageRaw, itemJson) ?? "")
      : undefined;

  const messages: ChatMessage[] = [];
  if (systemMessage) {
    messages.push({ role: "system", content: systemMessage });
  }

  if (memoryHandle?.loadMessages) {
    const priorTurns = memoryHandle.loadMessages();
    if (Array.isArray(priorTurns)) {
      for (const turn of priorTurns) {
        if (
          turn &&
          typeof turn === "object" &&
          typeof (turn as ChatMessage).role === "string" &&
          typeof (turn as ChatMessage).content === "string"
        ) {
          messages.push(turn as ChatMessage);
        }
      }
    }
  }

  messages.push({ role: "user", content: prompt });

  let finalText: string | null = null;
  const turns: AgentTraceTurn[] = [];

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let result: ModelInvokeResult;
      try {
        result = await primaryModel.invoke(messages, toolDefs);
      } catch (err) {
        if (needsFallback && fallbackModel) {
          result = await fallbackModel.invoke(messages, toolDefs);
        } else {
          throw err;
        }
      }

      const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
      const usage = usageFromResult(result);
      const reasoning = typeof result.reasoning === "string" ? result.reasoning : undefined;
      const turn: AgentTraceTurn = {
        iteration,
        ...(result.text ? { assistantText: String(result.text) } : {}),
        ...(reasoning ? { reasoning } : {}),
        toolCalls: toolCalls.map((call) => ({
          id: call.id,
          name: call.name,
          args: call.args ?? {},
        })),
        observations: [],
        ...(usage ? { usage } : {}),
      };
      turns.push(turn);

      if (toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: result.text ?? "",
          tool_calls: toolCalls.map((call, i) => ({
            id: toolCallId(call, i),
            type: "function" as const,
            function: {
              name: call.name,
              arguments: JSON.stringify(call.args ?? {}),
            },
          })),
        });
        for (let i = 0; i < toolCalls.length; i++) {
          const call = toolCalls[i];
          const tool = toolHandles.find((t) => t.name === call.name);
          if (!tool) {
            throw new NodeExecutionError(`Tool not found: ${call.name}`, {
              trace: capTrace({ turns }),
            });
          }
          let observation = "";
          if (typeof tool.invoke === "function") {
            const obs = await tool.invoke(call.args ?? {});
            observation = typeof obs === "string" ? obs : String(obs ?? "");
          }
          messages.push({
            role: "tool",
            content: observation,
            tool_call_id: toolCallId(call, i),
          });
          turn.observations.push({ tool: call.name, content: observation });
        }
        continue;
      }

      finalText = result.text ?? "";
      break;
    }
  } catch (err) {
    if (err instanceof NodeExecutionError) {
      if (!err.trace) err.trace = capTrace({ turns });
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new NodeExecutionError(message, { trace: capTrace({ turns }) });
  }

  if (finalText === null) {
    throw new NodeExecutionError(
      `Agent did not produce a final answer within ${maxIterations} iterations`,
      { trace: capTrace({ turns }) },
    );
  }

  if (memoryHandle) {
    const userMsg: ChatMessage = { role: "user", content: prompt };
    const assistantMsg: ChatMessage = { role: "assistant", content: String(finalText) };
    if (typeof memoryHandle.appendTurn === "function") {
      memoryHandle.appendTurn(userMsg, assistantMsg);
    } else if (typeof memoryHandle.saveMessages === "function") {
      const prior =
        typeof memoryHandle.loadMessages === "function" ? memoryHandle.loadMessages() : [];
      memoryHandle.saveMessages([...(Array.isArray(prior) ? prior : []), userMsg, assistantMsg]);
    }
  }

  let output: unknown = finalText;
  if (parserHandle && typeof parserHandle.parse === "function") {
    output = await parserHandle.parse(finalText);
  }

  return {
    output: typeof output === "string" ? output : JSON.stringify(output),
    trace: capTrace({ turns }),
  };
}

export const langchainAgentToolExecutor: NodeExecutor = async (ctx) => {
  const node = ctx.getNode();
  const toolDescription = ctx.getParam<string>(
    "toolDescription",
    "AI Agent that can call other tools",
  );

  const handle: AgentToolHandle = {
    type: "@n8n/n8n-nodes-langchain.agentTool",
    name: node.name,
    description: toolDescription,
    async invoke(_args: Record<string, unknown>): Promise<string> {
      try {
        const result = await runNestedAgent(ctx, node.name);
        handle.agentTrace = result.trace;
        return result.output;
      } catch (err) {
        if (err instanceof NodeExecutionError && err.trace) {
          handle.agentTrace = err.trace;
        }
        throw err;
      }
    },
  };

  return [[{ json: handle as unknown as Record<string, unknown> }]];
};
