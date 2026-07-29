import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import type { IWorkflow } from "../../lib/workflow/types";
import { executeWorkflow } from "../../lib/engine/runner";
import { defaultExecutors } from "../../lib/engine";
import { getWebhookResponse, clearWebhookResponse } from "../../lib/engine/executors/respond-to-webhook";
import { resolveCredential } from "../credentials";
import { enqueueOrRun } from "../execute";

export default function webhooksRoute(app: Hono<AppEnv>) {
  // Public webhook endpoint — no auth required
  app.all("/webhook/:path", async (c) => {
    const path = c.req.param("path");
    const method = c.req.method;

    const webhookRoute = await prisma.webhookRoute.findUnique({
      where: { path },
      include: { workflow: true },
    });

    if (!webhookRoute || !webhookRoute.active || (webhookRoute.method !== "*" && webhookRoute.method !== method)) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    const workflow = webhookRoute.workflow;
    const definition = {
      id: workflow.id,
      name: workflow.name,
      active: workflow.active,
      nodes: JSON.parse(workflow.nodes),
      connections: JSON.parse(workflow.connections),
      settings: workflow.settings ? JSON.parse(workflow.settings) : undefined,
      staticData: workflow.staticData ? JSON.parse(workflow.staticData) : undefined,
      pinData: workflow.pinData ? JSON.parse(workflow.pinData) : undefined,
      meta: workflow.meta ? JSON.parse(workflow.meta) : undefined,
      versionId: workflow.versionId,
    } as unknown as IWorkflow;

    let requestData: Record<string, unknown>;
    try {
      requestData = await c.req.json();
    } catch {
      requestData = { body: await c.req.text().catch(() => "") };
    }

    const execution = await prisma.execution.create({
      data: {
        workflowId: workflow.id,
        status: "running",
        mode: "webhook",
      },
    });

    const webhookNodeName = definition.nodes.find(
      (n: { type: string }) => n.type === "n8n-nodes-base.webhook",
    )?.name;

    // Determine if workflow uses "Respond to Webhook" node
    const hasRespondNode = definition.nodes.some(
      (n: { type: string }) => n.type === "n8n-nodes-base.respondToWebhook",
    );

    // Check the webhook trigger's responseMode setting
    const webhookNode = definition.nodes.find(
      (n: { type: string }) => n.type === "n8n-nodes-base.webhook",
    );
    const responseMode = (webhookNode?.parameters as Record<string, unknown>)?.responseMode as string | undefined;
    const shouldWait = hasRespondNode || responseMode === "lastNode" || responseMode === "responseNode";

    const runOptions = {
      workflow: { ...definition, __executionId: execution.id },
      nodeExecutors: defaultExecutors,
      pinData: webhookNodeName
        ? { [webhookNodeName]: [{ json: requestData }] }
        : undefined,
      credentialResolver: resolveCredential,
    };

    const updateExecution = async (result: { success: boolean; runData: unknown }) => {
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: result.success ? "success" : "error",
          finishedAt: new Date(),
          runData: JSON.stringify(result.runData),
        },
      });
    };

    const handleError = async (err: unknown) => {
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: "error",
          finishedAt: new Date(),
          error: JSON.stringify({ message: err instanceof Error ? err.message : String(err) }),
        },
      });
    };

    if (!shouldWait) {
      // Fire-and-forget: enqueue job and return 202 immediately
      await enqueueOrRun(
        workflow.id,
        execution.id,
        "webhook",
        webhookNodeName ? { [webhookNodeName]: [{ json: requestData }] } : undefined,
      );

      return c.json(
        { success: true, executionId: execution.id, message: "Webhook received, execution started" },
        202,
      );
    }

    // Wait for execution to complete
    const runResult = await executeWorkflow(runOptions);
    await updateExecution(runResult);
    const webhookResponse = getWebhookResponse(execution.id);

    if (webhookResponse) {
      clearWebhookResponse(execution.id);
      const respHeaders: Record<string, string> = webhookResponse.headers ?? {};
      return new Response(JSON.stringify(webhookResponse.body), {
        status: webhookResponse.status,
        headers: { "Content-Type": "application/json", ...respHeaders },
      });
    }

    // Default response when no Respond to Webhook node stored a response
    return c.json(
      runResult.success
        ? { success: true, executionId: execution.id }
        : { error: "Execution failed", executionId: execution.id },
      runResult.success ? 200 : 500,
    );
  });

  // Admin: register a webhook route
  app.post("/api/v1/webhooks", async (c) => {
    const { workflowId, path, nodeId, method = "*" } = await c.req.json();

    if (!workflowId || !path || !nodeId) {
      return c.json({ error: "workflowId, path, and nodeId required" }, 400);
    }

    const webhook = await prisma.webhookRoute.create({
      data: { workflowId, path, nodeId, method, active: true },
    });

    return c.json(webhook, 201);
  });

  // Admin: list webhook routes
  app.get("/api/v1/webhooks", async (c) => {
    const routes = await prisma.webhookRoute.findMany({
      include: { workflow: { select: { id: true, name: true } } },
    });
    return c.json(routes);
  });

  // Admin: delete a webhook route
  app.delete("/api/v1/webhooks/:id", async (c) => {
    const id = c.req.param("id");
    await prisma.webhookRoute.delete({ where: { id } });
    return c.json({ success: true });
  });
}
