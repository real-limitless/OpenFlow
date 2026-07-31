import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUserWithProject } from "../services/users";
import {
  projectIdFromRequest,
  requireProjectPermission,
} from "../services/projects";
import {
  environmentIdFromRequest,
  resolveEnvironment,
} from "../services/environments";
import {
  isValidVariableKey,
  redactForClient,
  storeVariableValue,
} from "../services/variables";

export default function variablesRoute(app: Hono<AppEnv>) {
  // GET /api/v1/variables?scope=project|instance&projectId=&environmentId=&layer=base|env|all
  app.get("/api/v1/variables", async (c) => {
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);
    const scope = (c.req.query("scope") ?? "project").trim();
    const projectId = projectIdFromRequest(c) || personalId;
    const layer = (c.req.query("layer") ?? "all").trim(); // base | env | all
    const envRef = environmentIdFromRequest(c);

    if (scope === "instance") {
      const rows = await prisma.variable.findMany({
        where: {
          scope: "instance",
          ...(layer === "base"
            ? { environmentId: null }
            : layer === "env" && envRef
              ? { environmentId: envRef }
              : {}),
        },
        orderBy: { key: "asc" },
      });
      return c.json(rows.map(redactForClient));
    }

    const access = await requireProjectPermission(projectId, userId, "viewer");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    let environmentId: string | null | undefined;
    if (layer === "env" || (layer === "all" && envRef)) {
      const env = await resolveEnvironment(projectId, envRef);
      environmentId = env?.id ?? null;
    }

    const where =
      layer === "base"
        ? { scope: "project" as const, projectId, environmentId: null }
        : layer === "env"
          ? {
              scope: "project" as const,
              projectId,
              environmentId: environmentId ?? "__none__",
            }
          : { scope: "project" as const, projectId };

    const rows = await prisma.variable.findMany({
      where,
      orderBy: [{ environmentId: "asc" }, { key: "asc" }],
    });
    return c.json(rows.map(redactForClient));
  });

  // POST /api/v1/variables
  app.post("/api/v1/variables", async (c) => {
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);
    const body = await c.req.json<{
      key?: string;
      value?: unknown;
      scope?: string;
      projectId?: string;
      environmentId?: string | null;
      secret?: boolean;
    }>();

    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!isValidVariableKey(key)) {
      return c.json(
        { error: "key must be a valid identifier (A-Z, a-z, 0-9, _; max 128)" },
        400,
      );
    }

    const scope = body.scope === "instance" ? "instance" : "project";
    const secret = Boolean(body.secret);
    const projectId =
      scope === "project" ? body.projectId || projectIdFromRequest(c) || personalId : null;

    let environmentId: string | null = null;
    if (body.environmentId !== undefined && body.environmentId !== null && body.environmentId !== "") {
      if (scope === "project" && projectId) {
        const env = await resolveEnvironment(projectId, body.environmentId);
        if (!env) return c.json({ error: "Environment not found" }, 404);
        environmentId = env.id;
      } else {
        environmentId = body.environmentId;
      }
    } else if (body.environmentId === undefined) {
      // optional header for convenience when creating env-layer vars
      const ref = environmentIdFromRequest(c);
      if (ref && scope === "project" && projectId && c.req.query("layer") === "env") {
        const env = await resolveEnvironment(projectId, ref);
        environmentId = env?.id ?? null;
      }
    }

    if (scope === "instance") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (user?.role !== "owner" && user?.role !== "admin" && userId !== "local") {
        return c.json({ error: "Only instance admins can set instance variables" }, 403);
      }
    } else {
      const access = await requireProjectPermission(projectId!, userId, "editor");
      if (!access.ok) return c.json({ error: access.error }, access.status);
    }

    const stored = storeVariableValue(body.value, secret);

    try {
      const row = await prisma.variable.create({
        data: {
          key,
          value: stored,
          scope,
          projectId,
          environmentId,
          secret,
        },
      });
      return c.json(redactForClient(row), 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique constraint") || msg.includes("unique")) {
        return c.json({ error: "Variable key already exists in this scope/environment" }, 409);
      }
      throw err;
    }
  });

  // PUT /api/v1/variables/:id
  app.put("/api/v1/variables/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await prisma.variable.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    if (existing.scope === "instance") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (user?.role !== "owner" && user?.role !== "admin" && userId !== "local") {
        return c.json({ error: "Only instance admins can update instance variables" }, 403);
      }
    } else if (existing.projectId) {
      const access = await requireProjectPermission(existing.projectId, userId, "editor");
      if (!access.ok) return c.json({ error: "Not found" }, 404);
    }

    const body = await c.req.json<{
      key?: string;
      value?: unknown;
      secret?: boolean;
    }>();

    const update: { key?: string; value?: string; secret?: boolean } = {};
    if (typeof body.key === "string") {
      const key = body.key.trim();
      if (!isValidVariableKey(key)) {
        return c.json({ error: "invalid key" }, 400);
      }
      update.key = key;
    }
    if (body.secret !== undefined) update.secret = Boolean(body.secret);
    if (body.value !== undefined) {
      const secret = update.secret ?? existing.secret;
      update.value = storeVariableValue(body.value, secret);
    }

    try {
      const row = await prisma.variable.update({ where: { id }, data: update });
      return c.json(redactForClient(row));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique constraint") || msg.includes("unique")) {
        return c.json({ error: "Variable key already exists in this scope/environment" }, 409);
      }
      throw err;
    }
  });

  // DELETE /api/v1/variables/:id
  app.delete("/api/v1/variables/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await prisma.variable.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    if (existing.scope === "instance") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (user?.role !== "owner" && user?.role !== "admin" && userId !== "local") {
        return c.json({ error: "Only instance admins can delete instance variables" }, 403);
      }
    } else if (existing.projectId) {
      const access = await requireProjectPermission(existing.projectId, userId, "editor");
      if (!access.ok) return c.json({ error: "Not found" }, 404);
    }

    await prisma.variable.delete({ where: { id } });
    return c.body(null, 204);
  });
}
