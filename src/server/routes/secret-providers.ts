import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import {
  clearBackendCache,
  encryptProviderConfig,
  parseProviderConfig,
} from "../secrets";

const ALLOWED_TYPES = new Set(["local", "vault", "aws-sm"]);

function redactConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
  const out = { ...config };
  if (type === "vault" && "token" in out) out.token = "••••••••";
  if (type === "aws-sm") {
    if ("secretAccessKey" in out) out.secretAccessKey = "••••••••";
    if ("sessionToken" in out) out.sessionToken = "••••••••";
  }
  return out;
}

export default function secretProvidersRoute(app: Hono<AppEnv>) {
  // GET /api/v1/secret-providers
  app.get("/api/v1/secret-providers", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);

    const rows = await prisma.secretProvider.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return c.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        isDefault: r.isDefault,
        config: redactConfig(r.type, parseProviderConfig(r.type, r.configEncrypted)),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    );
  });

  // POST /api/v1/secret-providers
  app.post("/api/v1/secret-providers", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (
      userId !== "local" &&
      user?.role !== "owner" &&
      user?.role !== "admin"
    ) {
      return c.json({ error: "Only instance admins can manage secret providers" }, 403);
    }

    const body = await c.req.json<{
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
      isDefault?: boolean;
    }>();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const type = typeof body.type === "string" ? body.type.trim() : "";
    if (!name) return c.json({ error: "name required" }, 400);
    if (!ALLOWED_TYPES.has(type)) {
      return c.json({ error: "type must be local, vault, or aws-sm" }, 400);
    }

    const config = body.config && typeof body.config === "object" ? body.config : {};
    if (type === "vault") {
      if (!config.address || !config.token) {
        return c.json({ error: "vault requires config.address and config.token" }, 400);
      }
    }
    if (type === "aws-sm" && !config.region) {
      return c.json({ error: "aws-sm requires config.region" }, 400);
    }

    if (body.isDefault) {
      await prisma.secretProvider.updateMany({ data: { isDefault: false } });
    }

    const row = await prisma.secretProvider.create({
      data: {
        name,
        type,
        configEncrypted: encryptProviderConfig(config),
        isDefault: Boolean(body.isDefault),
      },
    });
    clearBackendCache();

    return c.json(
      {
        id: row.id,
        name: row.name,
        type: row.type,
        isDefault: row.isDefault,
        config: redactConfig(row.type, config),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
      201,
    );
  });

  // PATCH /api/v1/secret-providers/:id
  app.patch("/api/v1/secret-providers/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (
      userId !== "local" &&
      user?.role !== "owner" &&
      user?.role !== "admin"
    ) {
      return c.json({ error: "Only instance admins can manage secret providers" }, 403);
    }

    const existing = await prisma.secretProvider.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{
      name?: string;
      config?: Record<string, unknown>;
      isDefault?: boolean;
    }>();

    const data: { name?: string; configEncrypted?: string; isDefault?: boolean } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.config && typeof body.config === "object") {
      const prev = parseProviderConfig(existing.type, existing.configEncrypted);
      const merged = { ...prev, ...body.config };
      // Keep previous secrets if redacted placeholder sent
      if (merged.token === "••••••••") merged.token = prev.token;
      if (merged.secretAccessKey === "••••••••") merged.secretAccessKey = prev.secretAccessKey;
      if (merged.sessionToken === "••••••••") merged.sessionToken = prev.sessionToken;
      data.configEncrypted = encryptProviderConfig(merged);
    }
    if (body.isDefault === true) {
      await prisma.secretProvider.updateMany({ data: { isDefault: false } });
      data.isDefault = true;
    } else if (body.isDefault === false) {
      data.isDefault = false;
    }

    const row = await prisma.secretProvider.update({ where: { id }, data });
    clearBackendCache();

    return c.json({
      id: row.id,
      name: row.name,
      type: row.type,
      isDefault: row.isDefault,
      config: redactConfig(row.type, parseProviderConfig(row.type, row.configEncrypted)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  });

  // DELETE /api/v1/secret-providers/:id
  app.delete("/api/v1/secret-providers/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (
      userId !== "local" &&
      user?.role !== "owner" &&
      user?.role !== "admin"
    ) {
      return c.json({ error: "Only instance admins can manage secret providers" }, 403);
    }

    const existing = await prisma.secretProvider.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    const inUse = await prisma.credential.count({ where: { secretProviderId: id } });
    if (inUse > 0) {
      return c.json({ error: `Provider is used by ${inUse} credential(s)` }, 400);
    }

    await prisma.secretProvider.delete({ where: { id } });
    clearBackendCache();
    return c.body(null, 204);
  });
}
