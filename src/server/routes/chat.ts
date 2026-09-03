import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import type { INode } from "../../lib/workflow/types";
import { chatTriggerParams, isChatTriggerNode, resolveChatPath } from "../../lib/chat/path";
import { applyChatCors, authorizeChatRequest } from "../chat/auth";
import { renderHostedChatPage } from "../chat/html";
import { definitionFromWorkflowRow, runChatWorkflow } from "../chat/run";

async function loadPublicChat(path: string) {
  const route = await prisma.chatRoute.findUnique({
    where: { path },
    include: { workflow: true },
  });
  if (!route || !route.active || !route.public || !route.workflow.active) return null;

  const definition = definitionFromWorkflowRow(route.workflow);
  const node =
    definition.nodes.find((n) => n.id === route.nodeId && isChatTriggerNode(n)) ??
    definition.nodes.find((n) => isChatTriggerNode(n) && resolveChatPath(n) === path);
  if (!node || node.disabled) return null;
  const params = chatTriggerParams(node);
  if (!params.public) return null;
  return { route, definition, node, workflowRow: route.workflow, params };
}

export default function chatRoute(app: Hono<AppEnv>) {
  app.options("/chat/:path", async (c) => {
    const path = c.req.param("path");
    const ctx = await loadPublicChat(path);
    applyChatCors(c, ctx?.params.allowedOrigins ?? "*");
    return c.body(null, 204);
  });

  app.get("/chat/:path", async (c) => {
    const path = c.req.param("path");
    const ctx = await loadPublicChat(path);
    if (!ctx) return c.json({ error: "Chat not found" }, 404);

    applyChatCors(c, ctx.params.allowedOrigins);
    const auth = await authorizeChatRequest(c, ctx.node, ctx.params.authentication, ctx.workflowRow);
    if (!auth.ok) return c.json({ error: auth.message }, auth.status);

    if (c.req.query("format") === "json") {
      return c.json({
        path,
        mode: ctx.params.mode,
        postUrl: `/chat/${path}`,
        fields: ["chatInput", "sessionId", "action", "metadata"],
      });
    }

    const embed = c.req.query("embed") === "1" || ctx.params.mode === "embedded";
    c.header("Content-Security-Policy", "frame-ancestors *");
    return c.html(
      renderHostedChatPage({
        path,
        params: ctx.params,
        workflowName: ctx.workflowRow.name,
        embed,
      }),
    );
  });

  app.post("/chat/:path", async (c) => {
    const path = c.req.param("path");
    const ctx = await loadPublicChat(path);
    if (!ctx) return c.json({ error: "Chat not found" }, 404);

    applyChatCors(c, ctx.params.allowedOrigins);
    const auth = await authorizeChatRequest(c, ctx.node, ctx.params.authentication, ctx.workflowRow);
    if (!auth.ok) return c.json({ error: auth.message }, auth.status);

    let body: {
      chatInput?: unknown;
      sessionId?: unknown;
      action?: unknown;
      metadata?: unknown;
    } = {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "JSON body required" }, 400);
    }
    const chatInput = typeof body.chatInput === "string" ? body.chatInput : "";
    if (!chatInput.trim()) {
      return c.json({ error: "chatInput is required" }, 400);
    }

    const result = await runChatWorkflow({
      definition: ctx.definition,
      trigger: ctx.node as INode,
      workflowRow: ctx.workflowRow,
      chatInput,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      action: typeof body.action === "string" ? body.action : "sendMessage",
      metadata: body.metadata,
      mode: "webhook",
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
