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
      executions: list,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  app.get("/api/v1/executions/:id/stream", async (c) => {
    const userId = c.get("userId");
    const executionId = c.req.param("id");
    const abortSignal = c.req.raw.signal;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let pollCount = 0;
        let closed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const maxPolls = 600;

        const close = () => {
          if (closed) return;
          closed = true;
          if (timer) clearTimeout(timer);
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

          try {
            pollCount++;
            if (pollCount > maxPolls) {
              sendEvent({ type: "timeout" });
              close();
              return;
            }

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

            let runData: unknown = {};
            try {
              runData = JSON.parse(execution.runData || "{}");
            } catch {
              runData = {};
            }

            sendEvent({
              type: "status",
              status: execution.status,
              startedAt: execution.startedAt?.toISOString(),
              finishedAt: execution.finishedAt?.toISOString(),
              runData,
            });

            if (execution.status === "success" || execution.status === "error") {
              sendEvent({
                type: "complete",
                status: execution.status,
                data: runData,
              });
              close();
              return;
            }

            timer = setTimeout(poll, 250);
          } catch {
            sendEvent({ type: "error", message: "Polling error" });
            close();
          }
        };

        poll();
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

  app.get("/api/v1/executions/:id", async (c) => {
    const userId = c.get("userId");
    const executionId = c.req.param("id");

    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: { project: { members: { some: { userId } } } },
      },
    });

    if (!execution) {
      return c.json({ error: "Execution not found" }, 404);
    }

    return c.json(execution);
  });
}
