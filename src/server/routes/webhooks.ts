import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import type { IWorkflow } from "../../lib/workflow/types";
import type { ExecutionRunData } from "../../lib/engine/types";
import { executeWorkflow } from "../../lib/engine/runner";
import { getExecutorMap } from "../../lib/engine";
import {
  getWebhookResponse,
  clearWebhookResponse,
} from "../../lib/engine/executors/respond-to-webhook";
import { credentialResolverForProject } from "../credentials";
import { dataTableAccessForProject } from "../services/data-tables-access";
import { enqueueOrRun } from "../execute";
import { resolveSubWorkflowFromDb } from "../workflow-loader";
import { loadVarsMap } from "../services/variables";
import { getDefaultEnvironment } from "../services/environments";
import { notifyExecutionFinished, notifyExecutionStarted } from "../services/workflow-events";
import { persistExecutionProgress } from "../services/persist-execution-progress";
import {
  abortReasonFor,
  assertWorkflowConcurrency,
  finalizeIfActive,
  markExecutionTimeout,
  stampTimeoutDeadline,
} from "../services/execution-governance";
import {
  getWebhookAuthSettings,
  resolveWebhookAuthRequired,
} from "../services/instance-settings";
import {
  normalizeWebhookAuthMode,
  verifyWebhookAuth,
} from "../../lib/security/webhook-auth";

export default function webhooksRoute(app: Hono<AppEnv>) {
  // Public webhook endpoint — authenticated by header/basic/HMAC when required.
  app.all("/webhook/:path", async (c) => {
    const path = c.req.param("path");
    const method = c.req.method;

    const webhookRoute = await prisma.webhookRoute.findUnique({
      where: { path },
      include: { workflow: true },
    });

    if (
      !webhookRoute ||
      !webhookRoute.active ||
      (webhookRoute.method !== "*" && webhookRoute.method !== method)
    ) {
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

    const rawBody = await c.req.text().catch(() => "");
    let requestData: Record<string, unknown>;
    try {
      requestData = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      requestData = { body: rawBody };
    }

    const instanceAuth = await getWebhookAuthSettings();
    const required = resolveWebhookAuthRequired(instanceAuth.required);
    const settings = (definition.settings ?? {}) as Record<string, unknown>;
    const workflowSecret =
      typeof settings.webhookSecret === "string" ? settings.webhookSecret : "";
    const secret =
      workflowSecret ||
      instanceAuth.secret ||
      process.env.OPENFLOW_WEBHOOK_SECRET?.trim() ||
      "";
    const mode = normalizeWebhookAuthMode(settings.webhookAuthMode ?? instanceAuth.mode);

    if (required) {
      if (!secret) {
        return c.json({ error: "Webhook authentication required" }, 401);
      }
      const ok = verifyWebhookAuth({
        headers: c.req.raw.headers,
        body: rawBody,
        secret,
        mode,
      });
      if (!ok) {
        return c.json({ error: "Webhook authentication failed" }, 401);
      }
    }

    const quota = await assertWorkflowConcurrency(workflow.id, definition.settings);
    if (!quota.ok) {
      c.header("Retry-After", String(quota.retryAfterSec));
      return c.json({ error: quota.error, retryAfterSec: quota.retryAfterSec }, quota.status);
    }

    const execution = await prisma.execution.create({
      data: {
        workflowId: workflow.id,
        status: "running",
        mode: "webhook",
      },
    });
    notifyExecutionStarted(workflow.id, execution.id, "webhook");

    const isWebhookType = (t: string) =>
      t === "openflow-node-base.webhook" || t === "n8n-nodes-base.webhook";
    const isRespondType = (t: string) =>
      t === "openflow-node-base.respondToWebhook" || t === "n8n-nodes-base.respondToWebhook";

    const webhookNodeName = definition.nodes.find((n: { type: string }) =>
      isWebhookType(n.type),
    )?.name;

    // Determine if workflow uses "Respond to Webhook" node
    const hasRespondNode = definition.nodes.some((n: { type: string }) => isRespondType(n.type));

    // Check the webhook trigger's responseMode setting
    const webhookNode = definition.nodes.find((n: { type: string }) => isWebhookType(n.type));
    const responseMode = (webhookNode?.parameters as Record<string, unknown>)?.responseMode as
      string | undefined;
    const shouldWait =
      hasRespondNode || responseMode === "lastNode" || responseMode === "responseNode";

    const ownerId = workflow.userId;
    const projectId = workflow.projectId;

    const defaultEnv = await getDefaultEnvironment(projectId);
    const environmentId = defaultEnv?.id;
    const vars = await loadVarsMap(projectId, environmentId ?? null);

    const timeoutMs = await stampTimeoutDeadline(execution.id, definition.settings);
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs != null) {
      timeoutHandle = setTimeout(() => {
        void markExecutionTimeout(execution.id);
      }, timeoutMs);
    }

    const runOptions = {
      workflow: { ...definition, __executionId: execution.id },
      nodeExecutors: getExecutorMap(),
      pinData: webhookNodeName ? { [webhookNodeName]: [{ json: requestData }] } : undefined,
      credentialResolver: credentialResolverForProject(projectId, ownerId),
      dataTables: dataTableAccessForProject(projectId),
      vars,
      resolveSubWorkflow: resolveSubWorkflowFromDb,
      onProgress: async (partial: ExecutionRunData) => {
        await persistExecutionProgress(execution.id, partial);
      },
      shouldAbort: () => abortReasonFor(execution.id),
    };

    const updateExecution = async (result: {
      success: boolean;
      runData: unknown;
      aborted?: string;
    }) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (result.aborted === "cancelled") {
        await finalizeIfActive(execution.id, {
          status: "cancelled",
          runData: JSON.stringify(result.runData),
          error: JSON.stringify({ message: "Execution cancelled" }),
        });
        notifyExecutionFinished(workflow.id, execution.id, "cancelled", "webhook");
        return;
      }
      if (result.aborted === "timeout") {
        await finalizeIfActive(execution.id, {
          status: "error",
          runData: JSON.stringify(result.runData),
          error: JSON.stringify({ code: "timeout", message: "Execution timed out" }),
        });
        notifyExecutionFinished(workflow.id, execution.id, "error", "webhook");
        return;
      }
      const status = result.success ? "success" : "error";
      const wrote = await finalizeIfActive(execution.id, {
        status,
        runData: JSON.stringify(result.runData),
      });
      if (wrote) notifyExecutionFinished(workflow.id, execution.id, status, "webhook");
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
      notifyExecutionFinished(workflow.id, execution.id, "error", "webhook");
    };

    if (!shouldWait) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      // Fire-and-forget: enqueue job and return 202 immediately
      await enqueueOrRun(
        workflow.id,
        execution.id,
        "webhook",
        webhookNodeName ? { [webhookNodeName]: [{ json: requestData }] } : undefined,
        undefined,
        ownerId,
        projectId,
        environmentId,
      );

      return c.json(
        {
          success: true,
          executionId: execution.id,
          message: "Webhook received, execution started",
        },
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
        status: webhookResponse.statusCode,
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
    const userId = c.get("userId");
    const { workflowId, path, nodeId, method = "*" } = await c.req.json();

    if (!workflowId || !path || !nodeId) {
      return c.json({ error: "workflowId, path, and nodeId required" }, 400);
    }

    const owned = await prisma.workflow.findFirst({
      where: { id: workflowId, project: { members: { some: { userId } } } },
      select: { id: true },
    });
    if (!owned) return c.json({ error: "Workflow not found" }, 404);

    const webhook = await prisma.webhookRoute.create({
      data: { workflowId, path, nodeId, method, active: true },
    });

    return c.json(webhook, 201);
  });

  // Admin: list webhook routes
  app.get("/api/v1/webhooks", async (c) => {
    const userId = c.get("userId");
    const routes = await prisma.webhookRoute.findMany({
      where: { workflow: { project: { members: { some: { userId } } } } },
      include: { workflow: { select: { id: true, name: true, settings: true } } },
    });
    return c.json(
      routes.map((r) => {
        let hasWorkflowSecret = false;
        try {
          const s = r.workflow.settings ? (JSON.parse(r.workflow.settings) as { webhookSecret?: string }) : {};
          hasWorkflowSecret = Boolean(s.webhookSecret);
        } catch {
          hasWorkflowSecret = false;
        }
        return {
          id: r.id,
          path: r.path,
          workflowId: r.workflowId,
          nodeId: r.nodeId,
          method: r.method,
          active: r.active,
          workflow: { id: r.workflow.id, name: r.workflow.name },
          hasWorkflowSecret,
        };
      }),
    );
  });

  app.put("/api/v1/webhooks/:id/secret", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const existing = await prisma.webhookRoute.findFirst({
      where: { id, workflow: { project: { members: { some: { userId } } } } },
      include: { workflow: true },
    });
    if (!existing) return c.json({ error: "Not found" }, 404);
    const body = await c.req.json<{ secret?: string; mode?: string }>().catch(() => ({}));
    let settings: Record<string, unknown> = {};
    try {
      settings = existing.workflow.settings ? (JSON.parse(existing.workflow.settings) as Record<string, unknown>) : {};
    } catch {
      settings = {};
    }
    if (typeof body.secret === "string") settings.webhookSecret = body.secret;
    if (body.mode === "header" || body.mode === "basic" || body.mode === "signed") {
      settings.webhookAuthMode = body.mode;
    }
    await prisma.workflow.update({
      where: { id: existing.workflowId },
      data: { settings: JSON.stringify(settings) },
    });
    return c.json({ ok: true, hasWorkflowSecret: Boolean(settings.webhookSecret) });
  });

  // Admin: delete a webhook route
  app.delete("/api/v1/webhooks/:id", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const existing = await prisma.webhookRoute.findFirst({
      where: { id, workflow: { project: { members: { some: { userId } } } } },
    });
    if (!existing) return c.json({ error: "Not found" }, 404);
    await prisma.webhookRoute.delete({ where: { id } });
    return c.json({ success: true });
  });
}
