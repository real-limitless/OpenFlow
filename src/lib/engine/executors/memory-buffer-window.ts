import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

export interface MemoryChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface MemoryInteraction {
  user: MemoryChatMessage;
  assistant: MemoryChatMessage;
}

export interface MemoryBufferWindowHandle {
  type: "@n8n/n8n-nodes-langchain.memoryBufferWindow";
  sessionId: string;
  contextWindowLength: number;
  loadMessages(): MemoryChatMessage[];
  saveMessages(messages: MemoryChatMessage[]): void;
  appendTurn(user: MemoryChatMessage, assistant: MemoryChatMessage): void;
  [key: string]: unknown;
}

const sessionStore = new Map<string, MemoryInteraction[]>();

export function clearMemoryBufferWindowStore(): void {
  sessionStore.clear();
}

export function getMemoryBufferWindowSessionStore(): Map<string, MemoryInteraction[]> {
  return sessionStore;
}

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveSessionId(ctx: ExecutionContext): string {
  const raw = ctx.getParam<unknown>("sessionId", "");
  let sessionId = "";
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      const resolved = ctx.evaluate(raw, firstItemJson(ctx));
      sessionId = String(resolved ?? "").trim();
    } else {
      sessionId = raw.trim();
    }
  }
  if (!sessionId) {
    const auto = (firstItemJson(ctx) as { sessionId?: unknown }).sessionId;
    if (auto != null) sessionId = String(auto).trim();
  }
  if (!sessionId) {
    throw new Error("No sessionId");
  }
  return sessionId;
}

function resolveContextWindowLength(ctx: ExecutionContext): number {
  const raw = ctx.getParam<unknown>("contextWindowLength", 5);
  let n: number;
  if (typeof raw === "string" && raw.startsWith("=")) {
    n = Number(ctx.evaluate(raw, firstItemJson(ctx)) ?? 0);
  } else {
    n = Number(raw ?? 5);
  }
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function pairInteractions(messages: MemoryChatMessage[]): MemoryInteraction[] {
  const interactions: MemoryInteraction[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user") {
      const next = messages[i + 1];
      if (next && next.role === "assistant") {
        interactions.push({ user: m, assistant: next });
        i++;
      }
    }
  }
  return interactions;
}

export const memoryBufferWindowExecutor: NodeExecutor = async (ctx) => {
  const sessionId = resolveSessionId(ctx);
  const contextWindowLength = resolveContextWindowLength(ctx);

  const handle: MemoryBufferWindowHandle = {
    type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
    sessionId,
    contextWindowLength,
    loadMessages(): MemoryChatMessage[] {
      const interactions = sessionStore.get(sessionId) ?? [];
      const start =
        contextWindowLength > 0 ? Math.max(0, interactions.length - contextWindowLength) : 0;
      const window = contextWindowLength > 0 ? interactions.slice(start) : [];
      const messages: MemoryChatMessage[] = [];
      for (const interaction of window) {
        messages.push(interaction.user, interaction.assistant);
      }
      return messages;
    },
    saveMessages(messages: MemoryChatMessage[]): void {
      sessionStore.set(sessionId, pairInteractions(messages));
    },
    appendTurn(user: MemoryChatMessage, assistant: MemoryChatMessage): void {
      const interactions = sessionStore.get(sessionId) ?? [];
      interactions.push({ user, assistant });
      sessionStore.set(sessionId, interactions);
    },
  };

  const out: INodeExecutionData[] = [{ json: handle as unknown as Record<string, unknown> }];
  return [out];
};
