import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { config } from "../../config";
import { prisma } from "../db";

async function checkDb(): Promise<"ok" | "error"> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "skipped" | "error"> {
  try {
    const { connection } = await import("../queue");
    const pong = await Promise.race([
      connection.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 1000)),
    ]);
    return pong === "PONG" ? "ok" : "error";
  } catch {
    return "error";
  }
}

export default function healthRoute(app: Hono<AppEnv>) {
  /** Liveness — process is up (used by Docker healthcheck). */
  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  /** Readiness — dependencies. */
  app.get("/health/ready", async (c) => {
    const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
    const ready = db === "ok";
    return c.json(
      {
        status: ready ? "ok" : "degraded",
        db,
        redis,
        auth: config.auth.disabled ? "disabled" : "enabled",
        worker: config.worker.enabled,
      },
      ready ? 200 : 503,
    );
  });
}
