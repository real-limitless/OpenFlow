import { createRequire } from "node:module";
import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { config } from "../../config";
import { prisma } from "../db";
import { getRecentLogs } from "../log";

const require = createRequire(import.meta.url);
const pkg = require("../../../package.json") as { version?: string; license?: string };
const OPENFLOW_VERSION = pkg.version ?? "0.0.0";
const OPENFLOW_LICENSE = pkg.license ?? "UNLICENSED";

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
    return c.json({
      status: "ok",
      version: OPENFLOW_VERSION,
      license: OPENFLOW_LICENSE,
    });
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
        secrets: "ok",
        logStream: config.log.streamType,
      },
      ready ? 200 : 503,
    );
  });

  /** Recent in-memory logs (auth required when AUTH_DISABLED is off). */
  app.get("/api/v1/logs/recent", (c) => {
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50));
    return c.json({ logs: getRecentLogs(limit) });
  });
}
