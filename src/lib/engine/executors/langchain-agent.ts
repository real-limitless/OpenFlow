import type { NodeExecutor, INodeExecutionData, ExecutionContext, IWorkflow } from "@/sdk";

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

interface McpBundleHandle {
  type?: string;
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
  invoke?(toolName: string, args: Record<string, unknown>): Promise<unknown> | unknown;
}

const MCP_CLIENT_TOOL_TYPE = "@n8n/n8n-nodes-langchain.mcpClientTool";

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

function observationFromMcpResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const r = result as { content?: unknown; isError?: boolean };
    if (typeof r.content === "string") {
      return r.isError ? `Error: ${r.content}` : r.content;
    }
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function expandToolJson(json: Record<string, unknown>): ToolHandle[] {
  if (typeof json.name === "string") {
    return [json as unknown as ToolHandle];
  }

  const bundle = json as unknown as McpBundleHandle;
  const isMcpBundle =
    bundle.type === MCP_CLIENT_TOOL_TYPE ||
    (Array.isArray(bundle.tools) && typeof bundle.invoke === "function");

  if (isMcpBundle && Array.isArray(bundle.tools) && typeof bundle.invoke === "function") {
    const invokeBundle = bundle.invoke.bind(bundle);
    return bundle.tools
      .filter((t) => t && typeof t.name === "string" && t.name.length > 0)
      .map((t) => ({
        name: t.name,
        description: t.description,
        schema: t.inputSchema,
        async invoke(args: Record<string, unknown>): Promise<string> {
          const result = await invokeBundle(t.name, args ?? {});
          return observationFromMcpResult(result);
        },
      }));
  }

  return [];
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
      for (const handle of expandToolJson(json as Record<string, unknown>)) {
        if (seen.has(handle.name)) continue;
        seen.add(handle.name);
        handles.push(handle);
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

function resolvePromptType(ctx: ExecutionContext, itemJson: Record<string, unknown>): string {
  const raw = ctx.getParam<unknown>("promptType", "auto");
  if (typeof raw === "string" && raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, itemJson);
    return String(resolved ?? "auto");
  }
  return typeof raw === "string" ? raw : "auto";
}

function resolvePromptForItem(ctx: ExecutionContext, itemJson: Record<string, unknown>): string {
  const promptType = resolvePromptType(ctx, itemJson);

  if (promptType === "define") {
    const text = ctx.getParam<unknown>("text", "");
    if (typeof text !== "string") return "";
    const resolved = ctx.evaluate(text, itemJson);
    return resolved != null ? String(resolved) : "";
  }

  const chatInput = (itemJson as { chatInput?: unknown }).chatInput;
  return chatInput != null ? String(chatInput) : "";
}

function resolveSystemMessage(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
  options: Record<string, unknown>,
): string | undefined {
  const raw = options.systemMessage;
  if (!raw || typeof raw !== "string") return undefined;
  const resolved = ctx.evaluate(raw, itemJson);
  return resolved != null ? String(resolved) : "";
}

function resolveMaxIterations(options: Record<string, unknown>): number {
  const raw = options.maxIterations;
  if (typeof raw === "number" && raw > 0) return raw;
  return 10;
}

async function invokeWithFallback(
  primary: ModelHandle,
  fallback: ModelHandle | null,
  needsFallback: boolean,
  messages: ChatMessage[],
  toolDefs: unknown[],
): Promise<ModelInvokeResult> {
  try {
    return await primary.invoke(messages, toolDefs);
  } catch (err) {
    if (needsFallback && fallback) {
      return await fallback.invoke(messages, toolDefs);
    }
    throw err;
  }
}

function toolCallId(call: ToolCall, index: number): string {
  if (call.id && typeof call.id === "string" && call.id.length > 0) return call.id;
  return `call_${call.name}_${index}`;
}

export const langchainAgentExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const workflow = ctx.getWorkflow();
  const subs = findConnectedSubNodes(workflow.connections, node.name);

  if (subs.languageModels.length === 0) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  if (subs.tools.length === 0) {
    throw new Error("At least one Tool sub-node must be connected");
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
  const returnIntermediateSteps = options.returnIntermediateSteps === true;
  const maxIterations = resolveMaxIterations(options);

  const toolHandles = getToolHandles(
    ctx,
    subs.tools.map((t) => t.name),
  );
  if (toolHandles.length === 0) {
    throw new Error(
      "Tool sub-nodes connected but no valid tool handles were produced",
    );
  }
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

  const outputItems: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const itemJson = item.json ?? {};

    const prompt = resolvePromptForItem(ctx, itemJson);
    if (!prompt) {
      throw new Error("No prompt specified");
    }

    const systemMessage = resolveSystemMessage(ctx, itemJson, options);

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

    const intermediateSteps: Array<{
      action: { tool: string; toolInput: Record<string, unknown> };
      observation: string;
    }> = [];

    let finalText: string | null = null;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const result = await invokeWithFallback(
        primaryModel,
        fallbackModel,
        needsFallback,
        messages,
        toolDefs,
      );

      const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
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
            throw new Error(`Tool not found: ${call.name}`);
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
          intermediateSteps.push({
            action: { tool: call.name, toolInput: call.args ?? {} },
            observation,
          });
        }
        continue;
      }

      finalText = result.text ?? "";
      break;
    }

    if (finalText === null) {
      throw new Error(`Agent did not produce a final answer within ${maxIterations} iterations`);
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
      output = parserHandle.parse(finalText);
    }

    const json: Record<string, unknown> = { output };
    if (returnIntermediateSteps) {
      json.intermediateSteps = intermediateSteps;
    }

    const pairedItem = item.pairedItem ?? { item: itemIndex, input: 0 };
    outputItems.push({ json, pairedItem });
  }

  return [outputItems];
};
