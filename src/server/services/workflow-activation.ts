import { prisma } from "../db";
import type { INode } from "../../lib/workflow/types";
import { isFormTriggerNode, resolveFormPath } from "../forms/register";
import { syncChatRoutes } from "../chat/register";

export type ActivationResult =
  { ok: true; id: string; active: boolean } | { ok: false; status: 404 | 409; error: string };

/**
 * Persist active/inactive and register or clear webhook, schedule, form, and chat routes.
 * Same behavior as PATCH /api/v1/workflows/:id/activate.
 */
export async function setWorkflowActive(
  workflowId: string,
  active: boolean,
): Promise<ActivationResult> {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) return { ok: false, status: 404, error: "Workflow not found" };

  const nodes: INode[] = (() => {
    try {
      return JSON.parse(workflow.nodes) as INode[];
    } catch {
      return [];
    }
  })();

  if (active) {
    const webhookNodes = nodes.filter(
      (n) => n.type === "n8n-nodes-base.webhook" || n.type === "openflow-node-base.webhook",
    );
    for (const node of webhookNodes) {
      const path =
        (node.parameters?.path as string | undefined) ??
        node.name.toLowerCase().replace(/\s+/g, "-");
      const method = (node.parameters?.httpMethod as string | undefined) ?? "POST";
      await prisma.webhookRoute.upsert({
        where: { path },
        create: { workflowId, nodeId: node.id, path, method, active: true },
        update: { workflowId, active: true },
      });
    }

    const scheduleNodes = nodes.filter(
      (n) =>
        n.type === "n8n-nodes-base.scheduleTrigger" ||
        n.type === "openflow-node-base.scheduleTrigger",
    );
    for (const node of scheduleNodes) {
      const interval = node.parameters?.rule as
        { interval?: Array<{ field?: string }> } | undefined;
      const cronExpr = interval?.interval?.[0]?.field ?? "0 * * * *";
      await prisma.scheduledTrigger.upsert({
        where: { workflowId_nodeId: { workflowId, nodeId: node.id } },
        create: { workflowId, nodeId: node.id, cronExpr, active: true },
        update: { cronExpr, active: true },
      });
    }

    const formNodes = nodes.filter((n) => isFormTriggerNode(n) && !n.disabled);
    const claimedPaths = new Set<string>();
    for (const node of formNodes) {
      const formPath = resolveFormPath(node);
      if (claimedPaths.has(formPath)) {
        return {
          ok: false,
          status: 409,
          error: `Duplicate form path “${formPath}” on this workflow`,
        };
      }
      claimedPaths.add(formPath);
      const existing = await prisma.formRoute.findUnique({ where: { path: formPath } });
      if (existing && existing.workflowId !== workflowId) {
        return {
          ok: false,
          status: 409,
          error: `Form path “${formPath}” is already used by another workflow`,
        };
      }
      await prisma.formRoute.upsert({
        where: { path: formPath },
        create: {
          path: formPath,
          workflowId,
          nodeId: node.id,
          active: true,
        },
        update: {
          workflowId,
          nodeId: node.id,
          active: true,
        },
      });
    }

    const activeNodeIds = new Set(formNodes.map((n) => n.id));
    const existingForms = await prisma.formRoute.findMany({ where: { workflowId } });
    for (const fr of existingForms) {
      if (!activeNodeIds.has(fr.nodeId)) {
        await prisma.formRoute.update({
          where: { id: fr.id },
          data: { active: false },
        });
      }
    }

    const chatSync = await syncChatRoutes(workflowId, nodes, true);
    if (chatSync.error) {
      return { ok: false, status: chatSync.status ?? 409, error: chatSync.error };
    }
  } else {
    await prisma.webhookRoute.updateMany({
      where: { workflowId },
      data: { active: false },
    });
    await prisma.scheduledTrigger.updateMany({
      where: { workflowId },
      data: { active: false },
    });
    await prisma.formRoute.updateMany({
      where: { workflowId },
      data: { active: false },
    });
    await syncChatRoutes(workflowId, nodes, false);
  }

  const updated = await prisma.workflow.update({
    where: { id: workflowId },
    data: { active },
  });

  return { ok: true, id: updated.id, active: updated.active };
}
