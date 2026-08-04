import type { NodeExecutor } from "@/sdk";

/**
 * Manual Chat Trigger — starts an AI workflow from the n8n editor's Test panel.
 *
 * A trigger-only node with no user-configurable parameters. It forwards the
 * manual chat input message as three fields (`chatInput`, `content`, `message`)
 * for compatibility with downstream Agent / Chain nodes.
 *
 * This node does **not** support hosted web chat, embedded chat, authentication,
 * multi-turn session management, webhooks, or sub-node connectors. It exists
 * purely for interactive testing during workflow development.
 *
 * Gaps (documented TODOs):
 *  - No polling or webhook integration (purely manual-execution trigger).
 *  - No `continueOnFail` parameter (none exists in the n8n node).
 */
export const langchainManualChatTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const out = inputItems.map((item) => {
    const raw = (item.json ?? {}) as Record<string, unknown>;
    const chatInput =
      typeof raw.chatInput === "string"
        ? raw.chatInput
        : typeof raw.chatInput === "number" || typeof raw.chatInput === "boolean"
          ? String(raw.chatInput)
          : "";
    return {
      json: {
        chatInput,
        content: chatInput,
        message: chatInput,
      },
      binary: item.binary,
    };
  });

  return [out];
};
