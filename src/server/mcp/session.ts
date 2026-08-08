/** In-memory MCP sessions (default workflow binding). */

export type McpSessionState = {
  id: string;
  userId: string;
  defaultWorkflowId: string | null;
  createdAt: number;
  lastSeenAt: number;
};

const sessions = new Map<string, McpSessionState>();
const TTL_MS = 1000 * 60 * 60 * 8; // 8h

function prune() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastSeenAt > TTL_MS) sessions.delete(id);
  }
}

export function createMcpSession(userId: string, defaultWorkflowId: string | null = null): McpSessionState {
  prune();
  const id = crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  const state: McpSessionState = {
    id,
    userId,
    defaultWorkflowId,
    createdAt: now,
    lastSeenAt: now,
  };
  sessions.set(id, state);
  return state;
}

export function getMcpSession(id: string | undefined | null): McpSessionState | null {
  if (!id) return null;
  prune();
  const s = sessions.get(id);
  if (!s) return null;
  s.lastSeenAt = Date.now();
  return s;
}

export function deleteMcpSession(id: string | undefined | null): boolean {
  if (!id) return false;
  return sessions.delete(id);
}

export function setSessionWorkflow(session: McpSessionState, workflowId: string | null) {
  session.defaultWorkflowId = workflowId;
  session.lastSeenAt = Date.now();
}
