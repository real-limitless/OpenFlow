import type { INode, INodeExecutionData, IWorkflow } from "../workflow/types";
import type { ExecutionRunData } from "../engine/types";
import { extractChatResponseText } from "../engine/executors/langchain-chat-trigger";
import { typesEqual } from "../nodes/type-ids";

export function isChatResponseNode(node: { type?: string }): boolean {
  return Boolean(node.type && typesEqual(node.type, "openflow-node-langchain.chat"));
}

export function isRespondToWebhookNode(node: { type?: string }): boolean {
  return Boolean(node.type && typesEqual(node.type, "openflow-node-base.respondToWebhook"));
}

function flattenedItems(rd: ExecutionRunData[string] | undefined): INodeExecutionData[] {
  if (!rd?.items?.length) return [];
  return rd.items.flat();
}

/** Latest successful node items by finishedAt (then startedAt). */
export function lastSuccessfulItems(runData: ExecutionRunData): INodeExecutionData[] {
  let best: { at: string; items: INodeExecutionData[] } | null = null;
  for (const rd of Object.values(runData)) {
    if (rd.status !== "success") continue;
    const items = flattenedItems(rd);
    if (!items.length) continue;
    const at = rd.finishedAt || rd.startedAt || "";
    if (!best || at >= best.at) best = { at, items };
  }
  return best?.items ?? [];
}

function itemsFromNamedNodes(
  definition: IWorkflow,
  runData: ExecutionRunData,
  match: (node: INode) => boolean,
): INodeExecutionData[] {
  let best: { at: string; items: INodeExecutionData[] } | null = null;
  for (const node of definition.nodes) {
    if (node.disabled || !match(node)) continue;
    const rd = runData[node.name];
    if (!rd || rd.status !== "success") continue;
    const items = flattenedItems(rd);
    if (!items.length) continue;
    const at = rd.finishedAt || rd.startedAt || "";
    if (!best || at >= best.at) best = { at, items };
  }
  return best?.items ?? [];
}

function textFromWebhookBody(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body;
  if (typeof body === "object" && !Array.isArray(body)) {
    const rec = body as Record<string, unknown>;
    if (rec.output != null) return String(rec.output);
    if (rec.text != null) return String(rec.text);
    if (rec.message != null) return String(rec.message);
    return JSON.stringify(rec);
  }
  return String(body);
}

/**
 * Extract the user-facing chat reply from a finished run.
 * `responseNodes` prefers Chat / Respond to Webhook output; otherwise last-node
 * `output` / `text` (streaming falls back to the same).
 */
export function extractChatWorkflowResponse(
  definition: IWorkflow,
  runData: ExecutionRunData,
  responseMode: string,
  webhookBody?: unknown,
): string {
  if (responseMode === "responseNodes") {
    const fromWebhook = textFromWebhookBody(webhookBody);
    if (fromWebhook != null && fromWebhook !== "") return fromWebhook;
    const fromResponseNodes = itemsFromNamedNodes(
      definition,
      runData,
      (n) => isChatResponseNode(n) || isRespondToWebhookNode(n),
    );
    if (fromResponseNodes.length) {
      return extractChatResponseText(fromResponseNodes).text;
    }
  }
  return extractChatResponseText(lastSuccessfulItems(runData)).text;
}
