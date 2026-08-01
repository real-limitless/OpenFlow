import type { NodeExecutor, INodeExecutionData, ExecutionContext, IWorkflow } from "@/sdk";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

interface MemoryHandle {
  loadMessages(): ChatMessage[];
  saveMessages(messages: ChatMessage[]): void;
  appendTurn(user: ChatMessage, assistant: ChatMessage): void;
  [key: string]: unknown;
}

interface MessageValue {
  type?: string;
  message?: unknown;
  hideFromUI?: boolean;
}

function findConnectedMemoryNode(
  connections: IWorkflow["connections"],
  nodeName: string,
): string | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (t && t.node === nodeName && t.type === "ai_memory") {
            return sourceName;
          }
        }
      }
    }
  }
  return null;
}

function resolveConnectedMemory(
  ctx: ExecutionContext,
  sourceName: string,
): MemoryHandle | null {
  const items = ctx.getNodeInputItems(sourceName, 0);
  if (!items || items.length === 0) return null;
  const handle = items[0].json as unknown as MemoryHandle;
  if (typeof handle.loadMessages !== "function") return null;
  return handle;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveParam<T>(
  ctx: ExecutionContext,
  name: string,
  defaultValue: T,
  itemJson?: Record<string, unknown>,
): T {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "string" && raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, itemJson ?? firstItemJson(ctx));
    return (resolved ?? defaultValue) as T;
  }
  return raw as T;
}

function resolveCollectionMessages(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
): MessageValue[] {
  const raw = ctx.getParam<unknown>("messages", {});
  if (raw && typeof raw === "object" && "messageValues" in (raw as Record<string, unknown>)) {
    const values = (raw as { messageValues: unknown[] }).messageValues;
    if (Array.isArray(values)) {
      return values.map((v) => {
        if (v && typeof v === "object") {
          const entry = v as Record<string, unknown>;
          const type =
            typeof entry.type === "string" && entry.type.startsWith("=")
              ? String(ctx.evaluate(entry.type, itemJson) ?? "user")
              : (entry.type as string) ?? "user";
          const message =
            typeof entry.message === "string" && entry.message.startsWith("=")
              ? ctx.evaluate(entry.message, itemJson)
              : entry.message;
          return {
            type,
            message,
            hideFromUI: entry.hideFromUI === true,
          } as MessageValue;
        }
        return v as MessageValue;
      });
    }
  }
  return [];
}

function toRole(type: string): ChatMessage["role"] {
  if (type === "ai") return "assistant";
  if (type === "system") return "system";
  return "user";
}

export const n8nNodesLangchainMemoryManagerExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const mode = resolveParam<string>(ctx, "mode", "load");
  const continueOnFail = ctx.continueOnFail();
  const workflow = ctx.getWorkflow();

  const memorySource = findConnectedMemoryNode(workflow.connections, node.name);
  if (!memorySource) {
    throw new Error("An ai_memory sub-node must be connected");
  }

  const memory = resolveConnectedMemory(ctx, memorySource);
  if (!memory) {
    throw new Error("An ai_memory sub-node must be connected");
  }

  if (mode === "load") {
    const simplifyOutput = resolveParam<boolean>(ctx, "simplifyOutput", true);
    const groupMessages = resolveParam<boolean>(ctx, "options.groupMessages", true);

    const rawMessages = memory.loadMessages();
    const output: INodeExecutionData[] = [];

    if (simplifyOutput) {
      const simplified = rawMessages.map((m) => ({
        sender: m.role === "assistant" ? "AI" : m.role,
        text: m.content,
      }));
      if (groupMessages) {
        output.push({ json: { messages: simplified } });
      } else {
        for (const entry of simplified) {
          output.push({ json: entry });
        }
      }
    } else {
      const full = rawMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      if (groupMessages) {
        output.push({ json: { messages: full } });
      } else {
        for (const entry of full) {
          output.push({ json: entry });
        }
      }
    }

    if (output.length === 0) {
      output.push({ json: { messages: [] } });
    }

    return [output];
  }

  if (mode === "insert") {
    const insertMode = resolveParam<string>(ctx, "insertMode", "insert");
    const itemJson = items[0]?.json ?? {};
    const messageValues = resolveCollectionMessages(ctx, itemJson);

    const newMessages: ChatMessage[] = messageValues.map((mv) => ({
      role: toRole(mv.type ?? "user"),
      content: mv.message != null ? String(mv.message) : "",
    }));

    if (insertMode === "override") {
      memory.saveMessages(newMessages);
    } else {
      const existing = memory.loadMessages();
      memory.saveMessages([...existing, ...newMessages]);
    }

    return [items];
  }

  if (mode === "delete") {
    const deleteMode = resolveParam<string>(ctx, "deleteMode", "lastN");

    if (deleteMode === "all") {
      memory.saveMessages([]);
      return [items];
    }

    const lastN = resolveParam<number>(ctx, "lastMessagesCount", 2);
    if (!Number.isFinite(lastN) || lastN <= 0) {
      throw new Error("lastMessagesCount must be a positive number");
    }

    const existing = memory.loadMessages();
    if (lastN >= existing.length) {
      memory.saveMessages([]);
    } else {
      memory.saveMessages(existing.slice(0, existing.length - lastN));
    }

    return [items];
  }

  throw new Error(`Unknown mode: ${mode}`);
};
