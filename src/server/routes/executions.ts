import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import {
  authorizeIngestWorkflow,
  createRuntimeExecution,
  requireIngestAuth,
  updateRuntimeExecution,
  type IngestAuth,
  type IngestBody,
} from "../services/execution-ingest";
import { subscribeExecutionProgress } from "../services/workflow-events";
import { failStaleLlmIfNeeded, failStaleLlmList } from "../services/stale-llm-execution";

function ingestAuthFrom(c: { get: (k: string) => unknown }): IngestAuth {
  return {
    userId: c.get("userId") as string | undefined,
    authKind: c.get("authKind") as string | undefined,
    scopes: c.get("scopes") as string[] | undefined,
    workflowPolicy: c.get("workflowPolicy") as IngestAuth["workflowPolicy"],
  };
}

export default function executionsRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/workflows/:id/executions", async (c) => {
    const { id } = c.req.param();
    const auth = ingestAuthFrom(c);
    const denied = await authorizeIngestWorkflow(id, auth);
    if (denied) return c.json({ error: denied.error }, denied.status);
    let body: IngestBody;
    try {
      body = (await c.req.json()) as IngestBody;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const result = await createRuntimeExecution(id, body);
    if (!result.ok) return c.json({ error: result.failure.error }, result.failure.status);
    return c.json(
      {
        id: result.row.id,
        workflowId: result.row.workflowId,
        status: result.row.status,
        mode: result.row.mode,
      },
      201,
    );
  });

  app.patch("/api/v1/executions/:id", async (c) => {
    const auth = ingestAuthFrom(c);
    const denied = requireIngestAuth(auth);
    if (denied) return c.json({ error: denied.error }, denied.status);
    const executionId = c.req.param("id");
    let body: IngestBody;
    try {
      body = (await c.req.json()) as IngestBody;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const existing = await prisma.execution.findFirst({
      where: { id: executionId, mode: "runtime" },
      select: { workflowId: true },
    });
    if (!existing) return c.json({ error: "Execution not found" }, 404);
    const wfDenied = await authorizeIngestWorkflow(existing.workflowId, auth);
    if (wfDenied) return c.json({ error: wfDenied.error }, wfDenied.status);
    const result = await updateRuntimeExecution(executionId, auth.userId!, body);
    if (!result.ok) return c.json({ error: result.failure.error }, result.failure.status);
    return c.json({
      id: result.row.id,
      workflowId: result.row.workflowId,
      status: result.row.status,
      mode: result.row.mode,
    });
  });

  app.get("/api/v1/executions", async (c) => {
    const userId = c.get("userId");
    const page = parseInt(c.req.query("page") ?? "1");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 100);
    const offset = (page - 1) * limit;
    const projectIds = (
      await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      })
    ).map((m) => m.projectId);
    const owned = { workflow: { projectId: { in: projectIds } } };

    const [list, total] = await Promise.all([
      prisma.execution.findMany({
        where: owned,
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          workflow: { select: { id: true, name: true } },
        },
      }),
      prisma.execution.count({ where: owned }),
    ]);

    return c.json({
      executions: await failStaleLlmList(list),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  app.get("/api/v1/executions/dlq", async (c) => {
    const userId = c.get("userId");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 100);
    const projectIds = (
      await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      })
    ).map((m) => m.projectId);
    const list = await prisma.execution.findMany({
      where: {
        status: "error",
        workflow: { projectId: { in: projectIds } },
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { workflow: { select: { id: true, name: true, settings: true } } },
    });
    return c.json({
      executions: list.map((e) => {
        let error: unknown = e.error;
        try {
          error = e.error ? JSON.parse(e.error) : null;
        } catch {
          /* keep */
        }
        let runData: Record<string, { status?: string; error?: string }> = {};
        try {
          runData = JSON.parse(e.runData || "{}") as typeof runData;
        } catch {
          runData = {};
        }
        const failed = Object.entries(runData).find(([, v]) => v?.status === "error");
        return {
          id: e.id,
          workflowId: e.workflowId,
          workflowName: e.workflow.name,
          status: e.status,
          mode: e.mode,
          startedAt: e.startedAt.toISOString(),
          finishedAt: e.finishedAt?.toISOString() ?? null,
          error,
          failedNode: failed?.[0] ?? null,
          failedMessage: failed?.[1]?.error ?? (error as { message?: string } | null)?.message ?? null,
        };
      }),
    });
  });

  app.get("/api/v1/executions/inbox", async (c) => {
    const userId = c.get("userId");
    const projectIds = (
      await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      })
    ).map((m) => m.projectId);
    const list = await prisma.execution.findMany({
      where: {
        status: "waiting",
        workflow: { projectId: { in: projectIds } },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { workflow: { select: { id: true, name: true } } },
    });
    const items = list.map((row) => {
      let wait: { nodeName?: string; resume?: string; resumeAt?: string | null } = {};
      try {
        wait = row.meta ? ((JSON.parse(row.meta) as { wait?: typeof wait }).wait ?? {}) : {};
      } catch {
        wait = {};
      }
      return {
        id: row.id,
        workflowId: row.workflowId,
        workflowName: row.workflow.name,
        startedAt: row.startedAt.toISOString(),
        nodeName: wait.nodeName ?? null,
        resume: wait.resume ?? null,
        resumeAt: wait.resumeAt ?? null,
      };
    });
    return c.json({ items });
  });

  app.post("/api/v1/executions/:id/approve", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json<{ comment?: string }>().catch(() => ({}));
    const { resumeWaitingExecution } = await import("../services/durable-wait");
    const ok = await resumeWaitingExecution(id, { decision: "approve", comment: body.comment });
    if (!ok) return c.json({ error: "Execution is not waiting" }, 409);
    return c.json({ ok: true, decision: "approve", executionId: id });
  });

  app.post("/api/v1/executions/:id/deny", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json<{ comment?: string }>().catch(() => ({}));
    const { resumeWaitingExecution } = await import("../services/durable-wait");
    const ok = await resumeWaitingExecution(id, { decision: "deny", comment: body.comment });
    if (!ok) return c.json({ error: "Execution is not waiting" }, 409);
    return c.json({ ok: true, decision: "deny", executionId: id });
  });

  app.get("/api/v1/executions/:id/stream", async (c) => {
    const userId = c.get("userId");
    const executionId = c.req.param("id");
    const abortSignal = c.req.raw.signal;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        let inFlight = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const progressSub = { off: () => {} };

        const close = () => {
          if (closed) return;
          closed = true;
          if (timer) clearTimeout(timer);
          progressSub.off();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        const sendEvent = (data: unknown) => {
          if (closed || abortSignal.aborted) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            close();
          }
        };

        const onAbort = () => close();
        abortSignal.addEventListener("abort", onAbort, { once: true });

        const poll = async () => {
          if (closed || abortSignal.aborted) {
            close();
            return;
          }
          if (inFlight) return;
          inFlight = true;

          try {
            const execution = await prisma.execution.findFirst({
              where: {
                id: executionId,
                workflow: { project: { members: { some: { userId } } } },
              },
            });

            if (closed || abortSignal.aborted) {
              close();
              return;
            }

            if (!execution) {
              sendEvent({ type: "error", message: "Execution not found" });
              close();
              return;
            }

            const live = await failStaleLlmIfNeeded(execution);

            let runData: unknown = {};
            try {
              runData = JSON.parse(live.runData || "{}");
            } catch {
              runData = {};
            }

            sendEvent({
              type: "status",
              status: live.status,
              startedAt: live.startedAt?.toISOString(),
              finishedAt: live.finishedAt?.toISOString(),
              runData,
            });

            if (live.status === "success" || live.status === "error" || live.status === "cancelled") {
              sendEvent({
                type: "complete",
                status: live.status,
                data: runData,
              });
              close();
              return;
            }

            timer = setTimeout(() => void poll(), 250);
          } catch {
            sendEvent({ type: "error", message: "Polling error" });
            close();
          } finally {
            inFlight = false;
          }
        };

        progressSub.off = subscribeExecutionProgress(executionId, () => {
          if (timer) clearTimeout(timer);
          void poll();
        });
        void poll();
      },
      cancel() {
        /* client disconnected */
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  app.post("/api/v1/executions/:id/resume", async (c) => {
    const userId = c.get("userId");
    const executionId = c.req.param("id");
    const owned = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: { project: { members: { some: { userId } } } },
      },
      select: { id: true },
    });
    if (!owned) return c.json({ error: "Execution not found" }, 404);
    const { resumeWaitingExecution } = await import("../services/durable-wait");
    const ok = await resumeWaitingExecution(executionId);
    if (!ok) return c.json({ error: "Execution is not waiting" }, 409);
    return c.json({ success: true, executionId });
  });

  app.post("/api/v1/executions/:id/cancel", async (c) => {
    const userId = c.get("userId");
    const executionId = c.req.param("id");
    const owned = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: { project: { members: { some: { userId } } } },
      },
      select: { id: true },
    });
    if (!owned) return c.json({ error: "Execution not found" }, 404);
    const { discardQueuedJobs, requestExecutionCancel } = await import(
      "../services/execution-governance"
    );
    const ok = await requestExecutionCancel(executionId);
    if (!ok) return c.json({ error: "Execution is not running or waiting" }, 409);
    await discardQueuedJobs(executionId);
    return c.json({ success: true, executionId, status: "cancelled" });
  });

  app.post("/api/v1/executions/:id/replay", async (c) => {
    const userId = c.get("userId");
    const executionId = c.req.param("id");
    const owned = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: { project: { members: { some: { userId } } } },
      },
      select: { id: true },
    });
    if (!owned) return c.json({ error: "Execution not found" }, 404);
    const { replayFailedExecution } = await import("../services/error-replay");
    const result = await replayFailedExecution(executionId);
    if (!result.ok) return c.json({ error: result.error }, result.status ?? 400);
    return c.json({
      success: true,
      executionId: result.executionId,
      destinationNode: result.destinationNode,
    }, 202);
  });

  app.get("/api/v1/executions/:id", async (c) => {
    const userId = c.get("userId");
    const executionId = c.req.param("id");

    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: { project: { members: { some: { userId } } } },
      },
      include: { workflow: { select: { id: true, name: true } } },
    });

    if (!execution) {
      return c.json({ error: "Execution not found" }, 404);
    }

    return c.json(await failStaleLlmIfNeeded(execution));
  });
}
