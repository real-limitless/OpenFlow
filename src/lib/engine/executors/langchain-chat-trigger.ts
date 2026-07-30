import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IConnections } from "@/lib/workflow/types";

interface ChatRequest {
  chatInput?: unknown;
  sessionId?: unknown;
  action?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

/**
 * Extract the chat response text from the last node's output items.
 *
 * In `whenLastNode` response mode, the Chat Trigger sends the `output` or
 * `text` field from the last node's first output item. If neither field is
 * present, the entire JSON object is serialized and sent as the response.
 */
export function extractChatResponseText(
  lastNodeItems: INodeExecutionData[],
): { text: string; isWholeObject: boolean } {
  if (lastNodeItems.length === 0) {
    return { text: "", isWholeObject: false };
  }
  const json = lastNodeItems[0].json ?? {};
  if (typeof json === "object" && json !== null && !Array.isArray(json)) {
    if ("output" in json) {
      return { text: String(json.output), isWholeObject: false };
    }
    if ("text" in json) {
      return { text: String(json.text), isWholeObject: false };
    }
    return { text: JSON.stringify(json), isWholeObject: true };
  }
  return { text: String(json), isWholeObject: false };
}

function hasRootNodeConnected(connections: IConnections, triggerName: string): boolean {
  const nodeConnections = connections[triggerName];
  if (!nodeConnections) return false;
  const mainOutputs = nodeConnections.main;
  if (!mainOutputs) return false;
  for (const output of mainOutputs) {
    if (!output) continue;
    for (const target of output) {
      if (target && target.node) return true;
    }
  }
  return false;
}

/**
 * Chat Trigger — starts a workflow on each incoming chat message.
 *
 * Input contract (host → executor): each input item's `json` carries the
 * parsed chat request body:
 *  - `chatInput`: the user's message text
 *  - `sessionId`: session identifier for memory retrieval
 *  - `action`: chat action (e.g. `sendMessage`)
 *  - `metadata`: arbitrary key-value data from embedded chat interfaces
 *
 * Output: a single `main` item per message whose `json` contains `chatInput`,
 * `sessionId`, `action`, and `metadata` (when present).
 *
 * Response modes (`options.responseMode`):
 *  - `whenLastNode`: the host extracts the chat response from the last node's
 *    output using `extractChatResponseText` (`output` → `text` → whole object).
 *  - `responseNodes`: the response is defined by a downstream Chat or Respond
 *    to Webhook node; the trigger does not store an immediate response.
 *  - `streaming`: deferred — requires streaming-capable nodes (TODO).
 *
 * The trigger requires an agent or chain root node connected on `main`.
 *
 * Gaps (documented TODOs):
 *  - `authentication` (basic / n8n user auth — host-level validation)
 *  - `streaming` response mode (requires SDK streaming hooks)
 *  - Memory session loading (the memory sub-node's `loadMessages` is called by
 *    the agent, not the trigger; the trigger provides `sessionId`)
 */
export const langchainChatTriggerExecutor: NodeExecutor = async (ctx, node) => {
  const workflow = ctx.getWorkflow();

  if (!hasRootNodeConnected(workflow.connections, node.name)) {
    throw new Error("Chat Trigger must connect to an agent or chain root node on main");
  }

  const inputItems = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const req = (item.json ?? {}) as ChatRequest;
    const json: Record<string, unknown> = {
      chatInput: req.chatInput ?? "",
      sessionId: req.sessionId ?? "",
      action: req.action ?? "sendMessage",
    };
    if (req.metadata != null) {
      json.metadata = req.metadata;
    }
    out.push({ json, binary: item.binary });
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};