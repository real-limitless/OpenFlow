import type { INode } from "../workflow/types";
import { toCanonicalType, typesEqual } from "../nodes/type-ids";
import { slugify } from "../forms/path";

export const CHAT_TRIGGER_TYPE = toCanonicalType("@n8n/n8n-nodes-langchain.chatTrigger");
export const MANUAL_CHAT_TRIGGER_TYPE = toCanonicalType(
  "@n8n/n8n-nodes-langchain.manualChatTrigger",
);

export function isChatTriggerNode(node: { type?: string }): boolean {
  return Boolean(node.type && typesEqual(node.type, CHAT_TRIGGER_TYPE));
}

export function isManualChatTriggerNode(node: { type?: string }): boolean {
  return Boolean(node.type && typesEqual(node.type, MANUAL_CHAT_TRIGGER_TYPE));
}

export function isAnyChatTriggerNode(node: { type?: string }): boolean {
  return isChatTriggerNode(node) || isManualChatTriggerNode(node);
}

export type ChatTriggerParams = {
  public: boolean;
  mode: string;
  authentication: string;
  initialMessages: string;
  makeAvailableInChat: boolean;
  agentName: string;
  agentDescription: string;
  allowedOrigins: string;
  inputPlaceholder: string;
  title: string;
  subtitle: string;
  loadPreviousSession: string;
  responseMode: string;
  requireButton: boolean;
  chatPath: string;
};

export function chatTriggerParams(node: INode): ChatTriggerParams {
  const params = (node.parameters ?? {}) as Record<string, unknown>;
  const options = (params.options ?? {}) as Record<string, unknown>;
  return {
    public: Boolean(params.public),
    mode: String(params.mode ?? "hosted"),
    authentication: String(params.authentication ?? "none"),
    initialMessages: String(params.initialMessages ?? ""),
    makeAvailableInChat: Boolean(params.makeAvailableInChat),
    agentName: String(params.agentName ?? ""),
    agentDescription: String(params.agentDescription ?? ""),
    allowedOrigins: String(options.allowedOrigins ?? "*"),
    inputPlaceholder: String(options.inputPlaceholder ?? ""),
    title: String(options.title ?? ""),
    subtitle: String(options.subtitle ?? ""),
    loadPreviousSession: String(options.loadPreviousSession ?? "off"),
    responseMode: String(options.responseMode ?? "whenLastNode"),
    requireButton: Boolean(options.requireButton),
    chatPath:
      (typeof options.chatPath === "string" && options.chatPath.trim()) ||
      (typeof params.chatPath === "string" && params.chatPath.trim()) ||
      "",
  };
}

/** Resolve public chat slug from node parameters. */
export function resolveChatPath(node: INode): string {
  const raw = chatTriggerParams(node).chatPath;
  if (raw) return slugify(raw);
  const base = (node.id || node.name || "chat").toString();
  return slugify(base).slice(0, 48) || "chat";
}

export { slugify };
