import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";

export default function executionsRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/executions", async (c) => {
    const page = parseInt(c.req.query("page") ?? "1");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 100);
    const offset = (page - 1) * limit;

    const [list, total] = await Promise.all([
      prisma.execution.findMany({
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          workflow: { select: { id: true, name: true } },
        },
      }),
      prisma.execution.count(),
    ]);

    return c.json({
      executions: list,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  app.get("/api/v1/executions/:id/stream", async (c) => {
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

            const execution = await prisma.execution.findUnique({
              where: { id: executionId },
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
    const executionId = c.req.param("id");

    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      return c.json({ error: "Execution not found" }, 404);
    }

    return c.json(execution);
  });
}
