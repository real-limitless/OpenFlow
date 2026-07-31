import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import {
  ensurePersonalProject,
  isProjectRole,
  requireProjectPermission,
  type ProjectRole,
} from "../services/projects";
import { ensureProjectEnvironments } from "../services/environments";

function iso(d: Date): string {
  return d.toISOString();
}

export default function projectsRoute(app: Hono<AppEnv>) {
  // GET /api/v1/projects — list memberships
  app.get("/api/v1/projects", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    await ensurePersonalProject(userId);

    const members = await prisma.projectMember.findMany({
      where: { userId },
      include: {
        project: {
          include: {
            _count: { select: { members: true, workflows: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return c.json(
      members.map((m) => ({
        id: m.project.id,
        name: m.project.name,
        type: m.project.type,
        role: m.role,
        memberCount: m.project._count.members,
        workflowCount: m.project._count.workflows,
        createdAt: iso(m.project.createdAt),
        updatedAt: iso(m.project.updatedAt),
      })),
    );
  });

  // POST /api/v1/projects — create team project
  app.post("/api/v1/projects", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const body = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name required" }, 400);

    const project = await prisma.project.create({
      data: {
        name,
        type: "team",
        members: { create: { userId, role: "owner" } },
      },
    });
    await ensureProjectEnvironments(project.id);

    return c.json(
      {
        id: project.id,
        name: project.name,
        type: project.type,
        role: "owner",
        memberCount: 1,
        workflowCount: 0,
        createdAt: iso(project.createdAt),
        updatedAt: iso(project.updatedAt),
      },
      201,
    );
  });

  // GET /api/v1/projects/:id
  app.get("/api/v1/projects/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const access = await requireProjectPermission(id, userId, "viewer");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { workflows: true, credentials: true } },
      },
    });
    if (!project) return c.json({ error: "Project not found" }, 404);

    return c.json({
      id: project.id,
      name: project.name,
      type: project.type,
      role: access.role,
      workflowCount: project._count.workflows,
      credentialCount: project._count.credentials,
      createdAt: iso(project.createdAt),
      updatedAt: iso(project.updatedAt),
      members: project.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        role: m.role,
        createdAt: iso(m.createdAt),
      })),
    });
  });

  // PATCH /api/v1/projects/:id
  app.patch("/api/v1/projects/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const access = await requireProjectPermission(id, userId, "admin");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const body = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
    const update: { name?: string } = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return c.json({ error: "name required" }, 400);
      update.name = name;
    }

    const project = await prisma.project.update({ where: { id }, data: update });
    return c.json({
      id: project.id,
      name: project.name,
      type: project.type,
      role: access.role,
      createdAt: iso(project.createdAt),
      updatedAt: iso(project.updatedAt),
    });
  });

  // DELETE /api/v1/projects/:id — owner only; cannot delete personal
  app.delete("/api/v1/projects/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const access = await requireProjectPermission(id, userId, "owner");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return c.json({ error: "Project not found" }, 404);
    if (project.type === "personal") {
      return c.json({ error: "Cannot delete personal project" }, 400);
    }

    await prisma.project.delete({ where: { id } });
    return c.body(null, 204);
  });

  // POST /api/v1/projects/:id/members
  app.post("/api/v1/projects/:id/members", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const access = await requireProjectPermission(id, userId, "admin");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const body = await c.req.json<{ email?: string; userId?: string; role?: string }>();
    let targetUserId = typeof body.userId === "string" ? body.userId : undefined;
    if (!targetUserId && body.email) {
      const u = await prisma.user.findUnique({ where: { email: body.email } });
      if (!u) return c.json({ error: "User not found" }, 404);
      targetUserId = u.id;
    }
    if (!targetUserId) return c.json({ error: "email or userId required" }, 400);

    const role = (body.role ?? "viewer") as string;
    if (!isProjectRole(role) || role === "owner") {
      return c.json({ error: "role must be admin, editor, or viewer" }, 400);
    }

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: targetUserId } },
      create: { projectId: id, userId: targetUserId, role },
      update: { role },
      include: { user: { select: { id: true, email: true } } },
    });

    return c.json(
      {
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        role: member.role,
        createdAt: iso(member.createdAt),
      },
      201,
    );
  });

  // PATCH /api/v1/projects/:id/members/:memberId
  app.patch("/api/v1/projects/:id/members/:memberId", async (c) => {
    const userId = c.get("userId");
    const { id, memberId } = c.req.param();
    const access = await requireProjectPermission(id, userId, "admin");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const body = await c.req.json<{ role?: string }>();
    const role = body.role as string | undefined;
    if (!role || !isProjectRole(role) || role === "owner") {
      return c.json({ error: "role must be admin, editor, or viewer" }, 400);
    }

    const existing = await prisma.projectMember.findFirst({
      where: { id: memberId, projectId: id },
    });
    if (!existing) return c.json({ error: "Member not found" }, 404);
    if (existing.role === "owner") {
      return c.json({ error: "Cannot change owner role via this endpoint" }, 400);
    }

    const member = await prisma.projectMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: { select: { id: true, email: true } } },
    });

    return c.json({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      role: member.role as ProjectRole,
      createdAt: iso(member.createdAt),
    });
  });

  // DELETE /api/v1/projects/:id/members/:memberId
  app.delete("/api/v1/projects/:id/members/:memberId", async (c) => {
    const userId = c.get("userId");
    const { id, memberId } = c.req.param();
    const access = await requireProjectPermission(id, userId, "admin");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const existing = await prisma.projectMember.findFirst({
      where: { id: memberId, projectId: id },
    });
    if (!existing) return c.json({ error: "Member not found" }, 404);
    if (existing.role === "owner") {
      return c.json({ error: "Cannot remove project owner" }, 400);
    }

    await prisma.projectMember.delete({ where: { id: memberId } });
    return c.body(null, 204);
  });
}
