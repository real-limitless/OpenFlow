export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
  createdAt: string;
};

export type AssistantSession = {
  id: string;
  workflowId: string;
  userId: string;
  opencodeSessionId?: string;
  messages: StoredMessage[];
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
    if (s) return s;
  }
  const now = new Date().toISOString();
  const session: AssistantSession = {
    id: newId(),
    workflowId,
    userId,
    messages: [],
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

export function clearSession(workflowId: string, userId: string): void {
  const key = `${userId}:${workflowId}`;
  const id = byWorkflow.get(key);
  if (id) {
    sessions.delete(id);
    byWorkflow.delete(key);
  }
}
