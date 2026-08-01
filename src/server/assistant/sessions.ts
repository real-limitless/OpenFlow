import type { IWorkflow } from "../../lib/workflow/types";

export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
  createdAt: string;
};

/** Workflow graph as it was before a user turn (for rollback). */
export type WorkflowCheckpoint = {
  /** User message id this checkpoint belongs to */
  messageId: string;
  workflow: IWorkflow;
  createdAt: string;
};

export type AssistantSession = {
  id: string;
  workflowId: string;
  userId: string;
  opencodeSessionId?: string;
  messages: StoredMessage[];
  checkpoints: WorkflowCheckpoint[];
  createdAt: string;
  updatedAt: string;
};

const sessions = new Map<string, AssistantSession>();
const byWorkflow = new Map<string, string>();

function newId(): string {
  return `as_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function getOrCreateSession(workflowId: string, userId: string): AssistantSession {
  const key = `${userId}:${workflowId}`;
  const existingId = byWorkflow.get(key);
  if (existingId) {
    const s = sessions.get(existingId);
    if (s) {
      if (!s.checkpoints) s.checkpoints = [];
      return s;
    }
  }
  const now = new Date().toISOString();
  const session: AssistantSession = {
    id: newId(),
    workflowId,
    userId,
    messages: [],
    checkpoints: [],
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.id, session);
  byWorkflow.set(key, session.id);
  return session;
}

export function getSession(id: string): AssistantSession | null {
  return sessions.get(id) ?? null;
}

export function appendMessage(
  session: AssistantSession,
  msg: Omit<StoredMessage, "id" | "createdAt">,
): StoredMessage {
  const full: StoredMessage = {
    ...msg,
    id: `am_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    createdAt: new Date().toISOString(),
  };
  session.messages.push(full);
  session.updatedAt = full.createdAt;
  // Cap history
  if (session.messages.length > 200) {
    session.messages = session.messages.slice(-160);
  }
  return full;
}

export function addCheckpoint(
  session: AssistantSession,
  messageId: string,
  workflow: IWorkflow,
): WorkflowCheckpoint {
  const cp: WorkflowCheckpoint = {
    messageId,
    workflow: structuredClone(workflow),
    createdAt: new Date().toISOString(),
  };
  session.checkpoints.push(cp);
  // Cap checkpoints
  if (session.checkpoints.length > 40) {
    session.checkpoints = session.checkpoints.slice(-30);
  }
  return cp;
}

/**
 * Truncate messages after `messageId` (inclusive keep of that message when keepMessage=true).
 * Returns the checkpoint for that user message if any.
 */
export function rollbackSession(
  session: AssistantSession,
  messageId: string,
  opts: { keepMessage?: boolean } = {},
): { checkpoint: WorkflowCheckpoint | null; truncated: number } {
  const keepMessage = opts.keepMessage !== false;
  const idx = session.messages.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    return { checkpoint: null, truncated: 0 };
  }

  const checkpoint =
    session.checkpoints.find((c) => c.messageId === messageId) ??
    // fallback: nearest earlier checkpoint
    [...session.checkpoints].reverse().find((c) => {
      const mi = session.messages.findIndex((m) => m.id === c.messageId);
      return mi !== -1 && mi <= idx;
    }) ??
    null;

  const cutAt = keepMessage ? idx + 1 : idx;
  const truncated = session.messages.length - cutAt;
  session.messages = session.messages.slice(0, cutAt);

  // Drop checkpoints for removed messages
  const keptIds = new Set(session.messages.map((m) => m.id));
  session.checkpoints = session.checkpoints.filter((c) => keptIds.has(c.messageId));
  session.updatedAt = new Date().toISOString();

  return { checkpoint, truncated };
}

export function clearSession(workflowId: string, userId: string): void {
  const key = `${userId}:${workflowId}`;
  const id = byWorkflow.get(key);
  if (id) {
    sessions.delete(id);
    byWorkflow.delete(key);
  }
}
