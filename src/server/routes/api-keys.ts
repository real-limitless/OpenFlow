import type { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import { DEFAULT_AGENT_SCOPES, parseScopes } from "../oauth/scopes";
import { normalizeGrantInputs, type GrantInput } from "../services/agent-policy";
import { loadWorkflowIfAllowed } from "../services/workflow-access";

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function parseScopesBody(scopes: unknown): string[] {
  // Empty body → classic agent scopes only (no secret write by default).
  if (!Array.isArray(scopes) || scopes.length === 0) return [...DEFAULT_AGENT_SCOPES];
  return parseScopes((scopes as string[]).join(" "));
}

function scopesFromStored(raw: string): string[] {
  try {
    const j = JSON.parse(raw || "[]") as unknown;
    if (Array.isArray(j)) return parseScopesBody(j);
  } catch {
    /* space-separated legacy */
  }
  return parseScopes(raw);
}

function grantJson(g: {
  id: string;
  workflowId: string;
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
  expiresAt: Date | null;
}) {
  return {
    id: g.id,
    workflowId: g.workflowId,
    canRead: g.canRead,
    canWrite: g.canWrite,
    canExecute: g.canExecute,
    expiresAt: g.expiresAt?.toISOString() ?? null,
  };
}

export default function apiKeysRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/api-keys", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json<{
      name?: string;
      scopes?: string[];
      restrictWorkflows?: boolean;
      canCreateWorkflows?: boolean;
      expiresAt?: string | null;
      grants?: GrantInput[];
    }>();
    const { name } = body ?? {};

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return c.json({ error: "name is required" }, 400);
    }

    await ensureUser(userId);

    const scopes = parseScopesBody(body.scopes);
    const restrictWorkflows = body.restrictWorkflows !== false; // default true
    const canCreateWorkflows = Boolean(body.canCreateWorkflows);
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) return c.json({ error: "invalid expiresAt" }, 400);
      expiresAt = d;
    }

    const grants = normalizeGrantInputs(body.grants ?? []);
    for (const g of grants) {
      const ok = await loadWorkflowIfAllowed(g.workflowId, userId, "viewer");
      if ("error" in ok) {
        return c.json({ error: `No access to workflow ${g.workflowId}` }, 400);
      }
    }

    const rawKey = "of_" + randomBytes(32).toString("hex");
    const keyHash = hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: name.trim(),
        keyHash,
        scopes: JSON.stringify(scopes),
        restrictWorkflows,
        canCreateWorkflows,
        expiresAt,
        grants:
          grants.length > 0
            ? {
                create: grants.map((g) => ({
                  workflowId: g.workflowId,
                  canRead: g.canRead,
                  canWrite: g.canWrite,
                  canExecute: g.canExecute,
                  expiresAt: g.expiresAt,
                })),
              }
            : undefined,
      },
      include: { grants: true },
    });

    return c.json(
      {
        id: apiKey.id,
        name: apiKey.name,
        scopes,
        restrictWorkflows: apiKey.restrictWorkflows,
        canCreateWorkflows: apiKey.canCreateWorkflows,
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
        createdAt: apiKey.createdAt.toISOString(),
        grants: apiKey.grants.map(grantJson),
        key: rawKey,
      },
      201,
    );
  });

  app.get("/api/v1/api-keys", async (c) => {
    const userId = c.get("userId");
    const keys = await prisma.apiKey.findMany({
      where: { userId },
      include: { grants: true },
      orderBy: { createdAt: "desc" },
    });
    return c.json(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        scopes: scopesFromStored(k.scopes),
        restrictWorkflows: k.restrictWorkflows,
        canCreateWorkflows: k.canCreateWorkflows,
        expiresAt: k.expiresAt?.toISOString() ?? null,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
        grants: k.grants.map(grantJson),
      })),
    );
  });

  app.get("/api/v1/api-keys/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const k = await prisma.apiKey.findFirst({
      where: { id, userId },
      include: { grants: true },
    });
    if (!k) return c.json({ error: "Not found" }, 404);
    return c.json({
      id: k.id,
      name: k.name,
      scopes: scopesFromStored(k.scopes),
      restrictWorkflows: k.restrictWorkflows,
      canCreateWorkflows: k.canCreateWorkflows,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
      grants: k.grants.map(grantJson),
    });
  });

  app.patch("/api/v1/api-keys/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{
      name?: string;
      scopes?: string[];
      restrictWorkflows?: boolean;
      canCreateWorkflows?: boolean;
      expiresAt?: string | null;
      grants?: GrantInput[];
    }>();

    const data: {
      name?: string;
      scopes?: string;
      restrictWorkflows?: boolean;
      canCreateWorkflows?: boolean;
      expiresAt?: Date | null;
    } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.scopes !== undefined) data.scopes = JSON.stringify(parseScopesBody(body.scopes));
    if (typeof body.restrictWorkflows === "boolean")
      data.restrictWorkflows = body.restrictWorkflows;
    if (typeof body.canCreateWorkflows === "boolean")
      data.canCreateWorkflows = body.canCreateWorkflows;
    if (body.expiresAt === null) data.expiresAt = null;
    else if (typeof body.expiresAt === "string") {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) return c.json({ error: "invalid expiresAt" }, 400);
      data.expiresAt = d;
    }

    let grants: ReturnType<typeof normalizeGrantInputs> | undefined;
    if (body.grants !== undefined) {
      grants = normalizeGrantInputs(body.grants);
      for (const g of grants) {
        const ok = await loadWorkflowIfAllowed(g.workflowId, userId, "viewer");
        if ("error" in ok) {
          return c.json({ error: `No access to workflow ${g.workflowId}` }, 400);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      if (grants !== undefined) {
        await tx.apiKeyWorkflowGrant.deleteMany({ where: { apiKeyId: id } });
        if (grants.length > 0) {
          await tx.apiKeyWorkflowGrant.createMany({
            data: grants.map((g) => ({
              apiKeyId: id,
              workflowId: g.workflowId,
              canRead: g.canRead,
              canWrite: g.canWrite,
              canExecute: g.canExecute,
              expiresAt: g.expiresAt,
            })),
          });
        }
      }
      if (Object.keys(data).length > 0) {
        await tx.apiKey.update({ where: { id }, data });
      }
    });
    const k = await prisma.apiKey.findUnique({ where: { id }, include: { grants: true } });
    return c.json({
      id: k!.id,
      name: k!.name,
      scopes: scopesFromStored(k!.scopes),
      restrictWorkflows: k!.restrictWorkflows,
      canCreateWorkflows: k!.canCreateWorkflows,
      expiresAt: k!.expiresAt?.toISOString() ?? null,
      lastUsedAt: k!.lastUsedAt?.toISOString() ?? null,
      createdAt: k!.createdAt.toISOString(),
      grants: k!.grants.map(grantJson),
    });
  });

  app.delete("/api/v1/api-keys/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const existing = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    await prisma.apiKey.delete({ where: { id } });
    return c.body(null, 204);
  });
}
