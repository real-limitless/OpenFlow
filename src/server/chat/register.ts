import { prisma } from "../db";
import type { INode } from "../../lib/workflow/types";
import { chatTriggerParams, isChatTriggerNode, resolveChatPath } from "../../lib/chat/path";

export { isChatTriggerNode, resolveChatPath, chatTriggerParams };

export async function syncChatRoutes(
  workflowId: string,
  nodes: INode[],
  active: boolean,
): Promise<{ error?: string; status?: 409 }> {
  if (!active) {
    await prisma.chatRoute.updateMany({
      where: { workflowId },
      data: { active: false },
    });
    return {};
  }

  const chatNodes = nodes.filter((n) => {
    if (!isChatTriggerNode(n) || n.disabled) return false;
    const p = chatTriggerParams(n);
    return p.public || p.makeAvailableInChat;
  });

  const claimed = new Set<string>();
  for (const node of chatNodes) {
    const path = resolveChatPath(node);
    if (claimed.has(path)) {
      return { error: `Duplicate chat path “${path}” on this workflow`, status: 409 };
    }
    claimed.add(path);
    const existing = await prisma.chatRoute.findUnique({ where: { path } });
    if (existing && existing.workflowId !== workflowId) {
      return { error: `Chat path “${path}” is already used by another workflow`, status: 409 };
    }
    const p = chatTriggerParams(node);
    await prisma.chatRoute.upsert({
      where: { path },
      create: {
        path,
        workflowId,
        nodeId: node.id,
        active: true,
        public: p.public,
        makeAvailableInChat: p.makeAvailableInChat,
        agentName: p.agentName,
        agentDescription: p.agentDescription,
      },
      update: {
        workflowId,
        nodeId: node.id,
        active: true,
        public: p.public,
        makeAvailableInChat: p.makeAvailableInChat,
        agentName: p.agentName,
        agentDescription: p.agentDescription,
      },
    });
  }

  const activeIds = new Set(chatNodes.map((n) => n.id));
  const existing = await prisma.chatRoute.findMany({ where: { workflowId } });
  for (const row of existing) {
    if (!activeIds.has(row.nodeId)) {
      await prisma.chatRoute.update({
        where: { id: row.id },
        data: { active: false },
      });
    }
  }
  return {};
}
