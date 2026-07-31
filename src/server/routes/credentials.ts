import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUserWithProject } from "../services/users";
import {
  listAccessibleProjectIds,
  projectIdFromRequest,
  requireProjectPermission,
} from "../services/projects";
import {
  listSharedResourceIds,
  requireResourceAccess,
} from "../services/shares";
import {
  getDefaultSecretProvider,
  storeCredentialSecret,
} from "../secrets";

function metaSelect() {
  return {
    id: true,
    name: true,
    type: true,
    projectId: true,
    secretProviderId: true,
    externalRef: true,
    createdAt: true,
  } as const;
}

function toMeta(row: {
  id: string;
  name: string;
  type: string;
  projectId: string;
  secretProviderId?: string | null;
  externalRef?: string | null;
  createdAt: Date;
  shared?: boolean;
}) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    projectId: row.projectId,
    secretProviderId: row.secretProviderId ?? null,
    externalRef: row.externalRef ?? null,
    external: Boolean(row.secretProviderId && row.externalRef),
    shared: row.shared,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

export default function credentialsRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/credentials", async (c) => {
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);
    const body = await c.req.json<{
      name?: string;
      type?: string;
      data?: unknown;
      projectId?: string;
      secretProviderId?: string | null;
      externalRef?: string | null;
    }>();

    const { name, type, data } = body;
    if (!name || !type || data === undefined || data === null) {
      return c.json({ error: "name, type, and data required" }, 400);
    }
    if (typeof data !== "object" || Array.isArray(data)) {
      return c.json({ error: "data must be an object" }, 400);
    }

    const projectId = body.projectId || projectIdFromRequest(c) || personalId;
    const access = await requireProjectPermission(projectId, userId, "editor");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    let secretProviderId = body.secretProviderId ?? null;
    if (secretProviderId === undefined || secretProviderId === null) {
      const def = await getDefaultSecretProvider();
      if (def && def.type !== "local") secretProviderId = def.id;
    }

    const id = crypto.randomUUID();
    const stored = await storeCredentialSecret({
      data: data as Record<string, unknown>,
      secretProviderId,
      externalRef: body.externalRef ?? null,
      credentialId: id,
    });

    const credential = await prisma.credential.create({
      data: {
        id,
        userId,
        projectId,
        name,
        type,
        dataEncrypted: stored.dataEncrypted,
        secretProviderId: stored.secretProviderId,
        externalRef: stored.externalRef,
      },
      select: metaSelect(),
    });

    return c.json(toMeta(credential), 201);
  });

  app.get("/api/v1/credentials", async (c) => {
    const userId = c.get("userId");
    await ensureUserWithProject(userId);

    const filterProjectId = projectIdFromRequest(c);
    let projectIds: string[];
    if (filterProjectId) {
      const access = await requireProjectPermission(filterProjectId, userId, "viewer");
      if (!access.ok) return c.json({ error: access.error }, access.status);
      projectIds = [filterProjectId];
    } else {
      projectIds = await listAccessibleProjectIds(userId, "viewer");
    }

    const includeUse = c.req.query("includeUse") === "1" || c.req.query("includeUse") === "true";
    const sharedIds = filterProjectId
      ? []
      : await listSharedResourceIds("credential", userId, includeUse ? "use" : "view");

    const credentials = await prisma.credential.findMany({
      where: {
        OR: [
          { projectId: { in: projectIds } },
          ...(sharedIds.length > 0 ? [{ id: { in: sharedIds } }] : []),
        ],
      },
      select: metaSelect(),
      orderBy: { createdAt: "desc" },
    });

    const sharedSet = new Set(sharedIds);
    return c.json(
      credentials.map((row) =>
        toMeta({
          ...row,
          shared: sharedSet.has(row.id) && !projectIds.includes(row.projectId),
        }),
      ),
    );
  });

  app.get("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const credential = await prisma.credential.findUnique({
      where: { id },
      select: metaSelect(),
    });
    if (!credential) return c.json({ error: "Not found" }, 404);

    const access = await requireResourceAccess(
      "credential",
      id,
      userId,
      "use",
      credential.projectId,
    );
    if (!access.ok) return c.json({ error: "Not found" }, 404);

    return c.json({
      ...toMeta(credential),
      shared: access.via === "share",
      sharePermission: access.via === "share" ? access.permission : undefined,
    });
  });

  app.put("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const existing = await prisma.credential.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    const access = await requireResourceAccess(
      "credential",
      id,
      userId,
      "edit",
      existing.projectId,
    );
    if (!access.ok) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{
      name?: string;
      data?: unknown;
      secretProviderId?: string | null;
      externalRef?: string | null;
    }>();

    const update: {
      name?: string;
      dataEncrypted?: string;
      secretProviderId?: string | null;
      externalRef?: string | null;
    } = {};
    if (body.name !== undefined) update.name = body.name;

    if (body.data !== undefined) {
      if (typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) {
        return c.json({ error: "data must be an object" }, 400);
      }
      const providerId =
        body.secretProviderId !== undefined
          ? body.secretProviderId
          : existing.secretProviderId;
      const stored = await storeCredentialSecret({
        data: body.data as Record<string, unknown>,
        secretProviderId: providerId,
        externalRef:
          body.externalRef !== undefined ? body.externalRef : existing.externalRef,
        credentialId: id,
      });
      update.dataEncrypted = stored.dataEncrypted;
      update.secretProviderId = stored.secretProviderId;
      update.externalRef = stored.externalRef;
    } else if (body.secretProviderId !== undefined || body.externalRef !== undefined) {
      if (body.secretProviderId !== undefined) update.secretProviderId = body.secretProviderId;
      if (body.externalRef !== undefined) update.externalRef = body.externalRef;
    }

    const credential = await prisma.credential.update({
      where: { id },
      data: update,
      select: metaSelect(),
    });

    return c.json(toMeta(credential));
  });

  app.delete("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const existing = await prisma.credential.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    const access = await requireResourceAccess(
      "credential",
      id,
      userId,
      "edit",
      existing.projectId,
    );
    if (!access.ok) return c.json({ error: "Not found" }, 404);

    await prisma.credential.delete({ where: { id } });
    return c.json({ success: true });
  });
}
