import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUserWithProject } from "../services/users";
import {
  projectIdFromRequest,
  requireProjectPermission,
} from "../services/projects";
import {
  ensureProjectEnvironments,
  isValidEnvSlug,
} from "../services/environments";

function iso(d: Date): string {
  return d.toISOString();
}

export default function environmentsRoute(app: Hono<AppEnv>) {
  // GET /api/v1/environments?projectId=
  app.get("/api/v1/environments", async (c) => {
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);
    const projectId = projectIdFromRequest(c) || personalId;

    const access = await requireProjectPermission(projectId, userId, "viewer");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    await ensureProjectEnvironments(projectId);
    const rows = await prisma.environment.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return c.json(
      rows.map((e) => ({
        id: e.id,
        projectId: e.projectId,
        name: e.name,
        slug: e.slug,
        isDefault: e.isDefault,
        sortOrder: e.sortOrder,
        createdAt: iso(e.createdAt),
        updatedAt: iso(e.updatedAt),
      })),
    );
  });

  // POST /api/v1/environments
  app.post("/api/v1/environments", async (c) => {
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);
    const body = await c.req.json<{
      name?: string;
      slug?: string;
      projectId?: string;
      isDefault?: boolean;
    }>();

    const projectId = body.projectId || projectIdFromRequest(c) || personalId;
    const access = await requireProjectPermission(projectId, userId, "admin");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug =
      typeof body.slug === "string"
        ? body.slug.trim().toLowerCase()
        : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (!name) return c.json({ error: "name required" }, 400);
    if (!isValidEnvSlug(slug)) {
      return c.json({ error: "slug must be lowercase alphanumeric (a-z0-9_-)" }, 400);
    }

    await ensureProjectEnvironments(projectId);
    const max = await prisma.environment.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    });

    if (body.isDefault) {
      await prisma.environment.updateMany({
        where: { projectId },
        data: { isDefault: false },
      });
    }

    try {
      const row = await prisma.environment.create({
        data: {
          projectId,
          name,
          slug,
          isDefault: Boolean(body.isDefault),
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
      return c.json(
        {
          id: row.id,
          projectId: row.projectId,
          name: row.name,
          slug: row.slug,
          isDefault: row.isDefault,
          sortOrder: row.sortOrder,
          createdAt: iso(row.createdAt),
          updatedAt: iso(row.updatedAt),
        },
        201,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique") || msg.includes("unique")) {
        return c.json({ error: "Environment slug already exists" }, 409);
      }
      throw err;
    }
  });

  // PATCH /api/v1/environments/:id
  app.patch("/api/v1/environments/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await prisma.environment.findUnique({ where: { id } });
    if (!existing?.projectId) return c.json({ error: "Not found" }, 404);

    const access = await requireProjectPermission(existing.projectId, userId, "admin");
    if (!access.ok) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{
      name?: string;
      slug?: string;
      isDefault?: boolean;
      sortOrder?: number;
    }>();

    const data: {
      name?: string;
      slug?: string;
      isDefault?: boolean;
      sortOrder?: number;
    } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.slug === "string") {
      const slug = body.slug.trim().toLowerCase();
      if (!isValidEnvSlug(slug)) return c.json({ error: "invalid slug" }, 400);
      data.slug = slug;
    }
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
      data.sortOrder = Math.trunc(body.sortOrder);
    }
    if (body.isDefault === true) {
      await prisma.environment.updateMany({
        where: { projectId: existing.projectId },
        data: { isDefault: false },
      });
      data.isDefault = true;
    } else if (body.isDefault === false && existing.isDefault) {
      return c.json({ error: "Set another environment as default first" }, 400);
    }

    try {
      const row = await prisma.environment.update({ where: { id }, data });
      return c.json({
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        slug: row.slug,
        isDefault: row.isDefault,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique") || msg.includes("unique")) {
        return c.json({ error: "Environment slug already exists" }, 409);
      }
      throw err;
    }
  });

  // DELETE /api/v1/environments/:id
  app.delete("/api/v1/environments/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await prisma.environment.findUnique({ where: { id } });
    if (!existing?.projectId) return c.json({ error: "Not found" }, 404);

    const access = await requireProjectPermission(existing.projectId, userId, "admin");
    if (!access.ok) return c.json({ error: "Not found" }, 404);

    if (existing.isDefault) {
      return c.json({ error: "Cannot delete the default environment" }, 400);
    }

    const count = await prisma.environment.count({
      where: { projectId: existing.projectId },
    });
    if (count <= 1) {
      return c.json({ error: "Cannot delete the last environment" }, 400);
    }

    await prisma.environment.delete({ where: { id } });
    return c.body(null, 204);
  });
}
