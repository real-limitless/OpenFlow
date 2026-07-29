import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { enqueueOrRun } from "../execute";

const scheduledJobs = new Map<string, NodeJS.Timeout>();

function parseCronToMs(expr: string): number | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minute, hour] = parts;

  if (minute.startsWith("*/")) {
    return parseInt(minute.slice(2)) * 60 * 1000;
  }
  if (minute === "0" && hour.startsWith("*/")) {
    return parseInt(hour.slice(2)) * 60 * 60 * 1000;
  }
  if (minute === "0" && hour === "*") {
    return 60 * 60 * 1000;
  }
  if (minute === "0" && hour !== "*") {
    return 24 * 60 * 60 * 1000;
  }

  return null;
}

async function startSchedule(schedule: { id: string; workflowId: string; cronExpr: string }) {
  const intervalMs = parseCronToMs(schedule.cronExpr);
  if (!intervalMs) return;

  const job = setInterval(async () => {
    try {
      const workflow = await prisma.workflow.findUnique({ where: { id: schedule.workflowId } });
      if (!workflow || !workflow.active) return;

      const execution = await prisma.execution.create({
        data: {
          workflowId: schedule.workflowId,
          status: "running",
          mode: "trigger",
        },
      });

      await enqueueOrRun(schedule.workflowId, execution.id, "trigger");

      await prisma.scheduledTrigger.update({
        where: { id: schedule.id },
        data: { lastRunAt: new Date() },
      });
    } catch (err) {
      console.error("Schedule execution failed:", err);
    }
  }, intervalMs);

  scheduledJobs.set(schedule.id, job);
}

async function stopSchedule(scheduleId: string) {
  const job = scheduledJobs.get(scheduleId);
  if (job) {
    clearInterval(job);
    scheduledJobs.delete(scheduleId);
  }
}

export async function initializeSchedules() {
  const schedules = await prisma.scheduledTrigger.findMany({ where: { active: true } });
  for (const schedule of schedules) {
    await startSchedule(schedule);
  }
  console.log(`[Scheduler] Started ${schedules.length} scheduled triggers`);
}

export default function schedulesRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/schedules", async (c) => {
    const list = await prisma.scheduledTrigger.findMany({
      include: { workflow: { select: { id: true, name: true } } },
    });
    return c.json(list);
  });

  app.post("/api/v1/schedules", async (c) => {
    const { workflowId, nodeId, cronExpr } = await c.req.json();
    if (!workflowId || !nodeId || !cronExpr) {
      return c.json({ error: "workflowId, nodeId, and cronExpr required" }, 400);
    }

    const schedule = await prisma.scheduledTrigger.create({
      data: { workflowId, nodeId, cronExpr, active: true },
    });

    await startSchedule(schedule);
    return c.json(schedule, 201);
  });

  app.delete("/api/v1/schedules/:id", async (c) => {
    const id = c.req.param("id");
    await stopSchedule(id);
    await prisma.scheduledTrigger.delete({ where: { id } });
    return c.json({ success: true });
  });
}
