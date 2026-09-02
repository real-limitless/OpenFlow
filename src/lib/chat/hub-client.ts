import { apiFetch } from "@/lib/auth/client";

export type ChatHubAgent = {
  workflowId: string;
  nodeId: string;
  path: string;
  name: string;
  description: string;
  workflowName: string;
};

export async function fetchChatHubAgents(): Promise<ChatHubAgent[]> {
  const res = await apiFetch("/api/v1/chat-hub/agents");
  if (!res.ok) return [];
  return (await res.json()) as ChatHubAgent[];
}

export async function sendChatHubMessage(
  workflowId: string,
  body: { chatInput: string; sessionId?: string; action?: string },
): Promise<{ output: string; executionId?: string; error?: string }> {
  const res = await apiFetch(`/api/v1/chat-hub/agents/${encodeURIComponent(workflowId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    output?: string;
    executionId?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return { output: json.output ?? "", executionId: json.executionId };
}
