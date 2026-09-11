import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { prisma } from "../db";
import { ensureUser, LOCAL_USER_ID } from "../services/users";
import { actorRole, requireInstanceAdmin } from "../services/instance-admin";
import {
  canChangeUserRole,
  createInviteToken,
  hashInviteToken,
  isUserRole,
  normalizeInviteRole,
} from "../../lib/auth/invites";
import { createInvite, listInvites, revokeInvite } from "../services/invites";
import { config } from "../../config";

function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/register?invite=${encodeURIComponent(token)}`;
}

export default function adminUsersRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/admin/users", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);

    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    });
    const invites = await listInvites();
    return c.json({
      users,
      invites,
      tryOut: config.auth.disabled,
      localUserId: LOCAL_USER_ID,
    });
  });

  app.post("/api/v1/admin/users/invite", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);

    const body = await c.req.json<{ email?: string; role?: string; days?: number }>().catch(() => ({}));
    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }
    const token = createInviteToken();
    const rec = await createInvite({
      email,
      role: normalizeInviteRole(body.role),
      tokenHash: hashInviteToken(token),
      createdBy: userId,
      ttlMs:
        typeof body.days === "number" && body.days > 0
          ? Math.min(body.days, 90) * 24 * 60 * 60 * 1000
          : undefined,
    });
    const origin = new URL(c.req.url).origin;
    return c.json(
      {
        id: rec.id,
        email: rec.email,
        role: rec.role,
        expiresAt: rec.expiresAt,
        token,
        inviteUrl: inviteUrl(origin, token),
      },
      201,
    );
  });

  app.delete("/api/v1/admin/users/invites/:id", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);
    const ok = await revokeInvite(c.req.param("id"));
    if (!ok) return c.json({ error: "Invite not found" }, 404);
    return c.json({ ok: true });
  });

  app.patch("/api/v1/admin/users/:id", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const gate = await requireInstanceAdmin(userId);
    if (gate !== true) return c.json({ error: gate.error }, gate.status);

    const targetId = c.req.param("id");
    const body = await c.req.json<{ role?: string }>().catch(() => ({}));
    if (!isUserRole(body.role)) return c.json({ error: "Invalid role" }, 400);

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, role: true },
    });
    if (!target) return c.json({ error: "User not found" }, 404);

    const ownerCount = await prisma.user.count({ where: { role: "owner" } });
    const check = canChangeUserRole({
      actorRole: await actorRole(userId),
      targetRole: target.role,
      nextRole: body.role,
      ownerCount,
    });
    if (!check.ok) return c.json({ error: check.error }, 400);

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { role: body.role },
      select: { id: true, email: true, role: true, updatedAt: true },
    });
    return c.json(updated);
  });
}
