import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import { listAccessibleProjectIds, projectIdFromRequest } from "../services/projects";
import { listSharedResourceIds } from "../services/shares";
import { loadWorkflowIfAllowed } from "../services/workflow-access";
import { isChatTriggerNode } from "../../lib/chat/path";
import { definitionFromWorkflowRow, runChatWorkflow } from "../chat/run";

export default function chatHubRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/chat-hub/agents", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);

    const filterProjectId = projectIdFromRequest(c);
    let projectIds: string[];
    if (filterProjectId) {
      projectIds = [filterProjectId];
    } else {
      projectIds = await listAccessibleProjectIds(userId, "viewer");
    }
    const sharedIds = filterProjectId ? [] : await listSharedResourceIds("workflow", userId, "view");

    const routes = await prisma.chatRoute.findMany({
      where: {
        active: true,
        makeAvailableInChat: true,
        workflow: {
          active: true,
          OR: [
            { projectId: { in: projectIds } },
            ...(sharedIds.length > 0 ? [{ id: { in: sharedIds } }] : []),
          ],
        },
      },
      include: { workflow: { select: { id: true, name: true, projectId: true } } },
      orderBy: { agentName: "asc" },
    });

    return c.json(
      routes.map((r) => ({
        workflowId: r.workflowId,
        nodeId: r.nodeId,
        path: r.path,
        name: r.agentName.trim() || r.workflow.name,
        description: r.agentDescription,
        workflowName: r.workflow.name,
      })),
    );
  });

  app.post("/api/v1/chat-hub/agents/:workflowId/messages", async (c) => {
    const userId = c.get("userId");
    const workflowId = c.req.param("workflowId");
    const access = await loadWorkflowIfAllowed(workflowId, userId, "viewer");
    if ("error" in access) return c.json({ error: access.error }, access.status);

    const row = access.row;
    if (!row.active) return c.json({ error: "Workflow is not active" }, 404);

    const definition = definitionFromWorkflowRow(row);
    const hubRoute = await prisma.chatRoute.findFirst({
      where: { workflowId, active: true, makeAvailableInChat: true },
    });
    const trigger =
      (hubRoute &&
        definition.nodes.find((n) => n.id === hubRoute.nodeId && isChatTriggerNode(n))) ||
      definition.nodes.find((n) => isChatTriggerNode(n) && !n.disabled);
    if (!trigger) return c.json({ error: "No Chat Trigger on this workflow" }, 404);

    let body: { chatInput?: unknown; sessionId?: unknown; action?: unknown; metadata?: unknown } =
      {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "JSON body required" }, 400);
    }
    const chatInput = typeof body.chatInput === "string" ? body.chatInput : "";
    if (!chatInput.trim()) return c.json({ error: "chatInput is required" }, 400);

    const result = await runChatWorkflow({
      definition,
      trigger,
      workflowRow: row,
      chatInput,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      action: typeof body.action === "string" ? body.action : "sendMessage",
      metadata: body.metadata,
      mode: "manual",
    });

    if (!result.success) {
      return c.json(
        { error: result.error ?? "Workflow failed", output: result.output, executionId: result.executionId },
        500,
      );
    }
    return c.json({ output: result.output, executionId: result.executionId });
  });
}
