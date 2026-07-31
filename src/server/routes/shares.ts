import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import {
  canManageShares,
  isSharePermission,
  isShareResourceType,
  listSharedResourceIds,
  type SharePermission,
  type ShareResourceType,
} from "../services/shares";

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

export default function sharesRoute(app: Hono<AppEnv>) {
  // GET /api/v1/shares/with-me — resources shared with me
  app.get("/api/v1/shares/with-me", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);

    const typeParam = c.req.query("resourceType");
    const types: ShareResourceType[] =
      typeParam && isShareResourceType(typeParam) ? [typeParam] : ["workflow", "credential"];

    const result: Array<{
      resourceType: ShareResourceType;
      resourceId: string;
      name: string;
      permission: string;
      shareId: string;
    }> = [];

    for (const resourceType of types) {
      const ids = await listSharedResourceIds(resourceType, userId, "use");
      if (ids.length === 0) continue;

      if (resourceType === "workflow") {
        const rows = await prisma.workflow.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        const shares = await prisma.share.findMany({
          where: { resourceType, resourceId: { in: ids } },
          select: { id: true, resourceId: true, permission: true, granteeUserId: true, granteeProjectId: true },
        });
        for (const row of rows) {
          const share = shares.find((s) => s.resourceId === row.id);
          result.push({
            resourceType,
            resourceId: row.id,
            name: row.name,
            permission: share?.permission ?? "view",
            shareId: share?.id ?? "",
          });
        }
      } else {
        const rows = await prisma.credential.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, type: true },
        });
        const shares = await prisma.share.findMany({
          where: { resourceType, resourceId: { in: ids } },
          select: { id: true, resourceId: true, permission: true },
        });
        for (const row of rows) {
          const share = shares.find((s) => s.resourceId === row.id);
          result.push({
            resourceType,
            resourceId: row.id,
            name: row.name,
            permission: share?.permission ?? "use",
            shareId: share?.id ?? "",
          });
        }
      }
    }

    return c.json(result);
  });

  // GET /api/v1/shares?resourceType=&resourceId=
  app.get("/api/v1/shares", async (c) => {
    const userId = c.get("userId");
    const resourceType = c.req.query("resourceType");
    const resourceId = c.req.query("resourceId");
    if (!resourceType || !isShareResourceType(resourceType) || !resourceId) {
      return c.json({ error: "resourceType and resourceId required" }, 400);
    }

    const manage = await canManageShares(resourceType, resourceId, userId);
    if (!manage.ok) return c.json({ error: manage.error }, manage.status);

    const shares = await prisma.share.findMany({
      where: { resourceType, resourceId },
      include: {
        granteeUser: { select: { id: true, email: true } },
        granteeProject: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return c.json(
      shares.map((s) => ({
        id: s.id,
        resourceType: s.resourceType,
        resourceId: s.resourceId,
        permission: s.permission,
        granteeUserId: s.granteeUserId,
        granteeUserEmail: s.granteeUser?.email ?? null,
        granteeProjectId: s.granteeProjectId,
        granteeProjectName: s.granteeProject?.name ?? null,
        createdByUserId: s.createdByUserId,
        expiresAt: iso(s.expiresAt),
        createdAt: iso(s.createdAt),
      })),
    );
  });

  // POST /api/v1/shares
  app.post("/api/v1/shares", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);

    const body = await c.req.json<{
      resourceType?: string;
      resourceId?: string;
      permission?: string;
      email?: string;
      granteeUserId?: string;
      granteeProjectId?: string;
      expiresAt?: string | null;
    }>();

    const resourceType = body.resourceType;
    const resourceId = body.resourceId;
    const permission = body.permission ?? "view";

    if (!resourceType || !isShareResourceType(resourceType) || !resourceId) {
      return c.json({ error: "resourceType and resourceId required" }, 400);
    }
    if (!isSharePermission(permission)) {
      return c.json({ error: "permission must be use, view, or edit" }, 400);
    }
    if (resourceType === "credential" && permission === "edit") {
      // credentials: use (runtime) or view (metadata); edit stays project-scoped
      return c.json({ error: "credential shares support use or view only" }, 400);
    }

    const manage = await canManageShares(resourceType, resourceId, userId);
    if (!manage.ok) return c.json({ error: manage.error }, manage.status);

    let granteeUserId = typeof body.granteeUserId === "string" ? body.granteeUserId : undefined;
    if (!granteeUserId && body.email) {
      const u = await prisma.user.findUnique({ where: { email: body.email } });
      if (!u) return c.json({ error: "User not found" }, 404);
      granteeUserId = u.id;
    }
    const granteeProjectId =
      typeof body.granteeProjectId === "string" ? body.granteeProjectId : undefined;

    if (!granteeUserId && !granteeProjectId) {
      return c.json({ error: "email, granteeUserId, or granteeProjectId required" }, 400);
    }
    if (granteeUserId && granteeProjectId) {
      return c.json({ error: "share with either a user or a project, not both" }, 400);
    }

    if (granteeProjectId) {
      const p = await prisma.project.findUnique({ where: { id: granteeProjectId } });
      if (!p) return c.json({ error: "Grantee project not found" }, 404);
    }

    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) return c.json({ error: "invalid expiresAt" }, 400);
      expiresAt = d;
    }

    // Upsert-like: replace existing share for same grantee+resource
    const existing = await prisma.share.findFirst({
      where: {
        resourceType,
        resourceId,
        ...(granteeUserId ? { granteeUserId } : { granteeProjectId }),
      },
    });

    const share = existing
      ? await prisma.share.update({
          where: { id: existing.id },
          data: { permission, expiresAt, createdByUserId: userId },
          include: {
            granteeUser: { select: { id: true, email: true } },
            granteeProject: { select: { id: true, name: true } },
          },
        })
      : await prisma.share.create({
          data: {
            resourceType,
            resourceId,
            permission: permission as SharePermission,
            granteeUserId: granteeUserId ?? null,
            granteeProjectId: granteeProjectId ?? null,
            createdByUserId: userId,
            expiresAt,
          },
          include: {
            granteeUser: { select: { id: true, email: true } },
            granteeProject: { select: { id: true, name: true } },
          },
        });

    return c.json(
      {
        id: share.id,
        resourceType: share.resourceType,
        resourceId: share.resourceId,
        permission: share.permission,
        granteeUserId: share.granteeUserId,
        granteeUserEmail: share.granteeUser?.email ?? null,
        granteeProjectId: share.granteeProjectId,
        granteeProjectName: share.granteeProject?.name ?? null,
        createdByUserId: share.createdByUserId,
        expiresAt: iso(share.expiresAt),
        createdAt: iso(share.createdAt),
      },
      existing ? 200 : 201,
    );
  });

  // DELETE /api/v1/shares/:id
  app.delete("/api/v1/shares/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const share = await prisma.share.findUnique({ where: { id } });
    if (!share) return c.json({ error: "Not found" }, 404);

    if (!isShareResourceType(share.resourceType)) {
      return c.json({ error: "Invalid share" }, 400);
    }

    const manage = await canManageShares(share.resourceType, share.resourceId, userId);
    // grantee can also revoke their own user share
    const isGrantee = share.granteeUserId === userId;
    if (!manage.ok && !isGrantee) {
      return c.json({ error: manage.error }, manage.status === 404 ? 404 : 403);
    }

    await prisma.share.delete({ where: { id } });
    return c.body(null, 204);
  });
}
