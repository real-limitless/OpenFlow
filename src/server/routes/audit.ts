import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import { requireInstanceAdmin } from "../services/instance-admin";
import { listAuditLogs } from "../services/audit";

export default function auditRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/admin/audit", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const limit = Number(c.req.query("limit") ?? "100");
    const events = await listAuditLogs(Number.isFinite(limit) ? limit : 100);
    return c.json({ events });
  });
}
