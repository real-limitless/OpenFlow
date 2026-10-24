import type { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import { DEFAULT_AGENT_SCOPES, parseScopes } from "../oauth/scopes";
import { normalizeGrantInputs, type GrantInput } from "../services/agent-policy";
import { loadWorkflowIfAllowed } from "../services/workflow-access";
import { apiKeyMaxTtlDays, resolveApiKeyExpiry } from "../lib/api-key-policy";
import { recordAudit, requestIp } from "../services/audit";
import { noteAccessLog } from "../../lib/observability/request-context";
import { createApiKeyBodySchema, patchApiKeyBodySchema } from "../validation/api-keys";

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

function keyJson(
  k: {
    id: string;
    name: string;
    scopes: string;
    restrictWorkflows: boolean;
    canCreateWorkflows: boolean;
    expiresAt: Date | null;
    lastUsedAt?: Date | null;
    createdAt: Date;
    ownerEmail?: string | null;
    ownerName?: string | null;
    grants: {
      id: string;
      workflowId: string;
      canRead: boolean;
      canWrite: boolean;
      canExecute: boolean;
      expiresAt: Date | null;
    }[];
  },
  extra?: { key?: string },
) {
  const expiresAt = k.expiresAt?.toISOString() ?? null;
  return {
    id: k.id,
    name: k.name,
    scopes: scopesFromStored(k.scopes),
    restrictWorkflows: k.restrictWorkflows,
    canCreateWorkflows: k.canCreateWorkflows,
    ownerEmail: k.ownerEmail ?? "",
    ownerName: k.ownerName ?? "",
    expiresAt,
    rotationDueAt: expiresAt,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
    grants: k.grants.map(grantJson),
    ...extra,
  };
}

function validationMessage(issues: { message: string }[]): string {
  return issues[0]?.message || "Invalid request";
}

export default function apiKeysRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/api-keys", async (c) => {
    const userId = c.get("userId");
    let raw: unknown = {};
    try {
      raw = await c.req.json();
    } catch {
      raw = {};
    }
    const parsed = createApiKeyBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: validationMessage(parsed.error.issues) }, 400);
    }
    const body = parsed.data;

    await ensureUser(userId);
    const creator = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const expiry = resolveApiKeyExpiry(body.expiresAt);
    if (!expiry.ok) return c.json({ error: expiry.error }, 400);

    const scopes = parseScopesBody(body.scopes);
    const restrictWorkflows = body.restrictWorkflows !== false; // default true
    const canCreateWorkflows = Boolean(body.canCreateWorkflows);
    const ownerEmail = body.ownerEmail ?? creator?.email ?? "";
    const ownerName = body.ownerName ?? "";

    const grants = normalizeGrantInputs((body.grants ?? []) as GrantInput[]);
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
        name: body.name,
        keyHash,
        scopes: JSON.stringify(scopes),
        restrictWorkflows,
        canCreateWorkflows,
        expiresAt: expiry.expiresAt,
        ownerEmail,
        ownerName,
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

    noteAccessLog({
      event: "key_change",
      action: "api_key.create",
      outcome: "success",
      actor: userId,
      audited: true,
    });
    void recordAudit({
      actorId: userId,
      action: "api_key.create",
      resource: "api_key",
      resourceId: apiKey.id,
      detail: {
        name: apiKey.name,
        ownerEmail,
        expiresAt: expiry.expiresAt.toISOString(),
        rotationDueAt: expiry.expiresAt.toISOString(),
      },
      ip: requestIp(c),
      event: "key_change",
      outcome: "success",
    });

    return c.json(keyJson(apiKey, { key: rawKey }), 201);
  });

  app.get("/api/v1/api-keys", async (c) => {
    const userId = c.get("userId");
    c.header("X-Api-Key-Max-Ttl-Days", String(apiKeyMaxTtlDays()));
    const keys = await prisma.apiKey.findMany({
      where: { userId },
      include: { grants: true },
      orderBy: { createdAt: "desc" },
    });
    return c.json(keys.map((k) => keyJson(k)));
  });

  app.get("/api/v1/api-keys/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const k = await prisma.apiKey.findFirst({
      where: { id, userId },
      include: { grants: true },
    });
    if (!k) return c.json({ error: "Not found" }, 404);
    return c.json(keyJson(k));
  });

  app.patch("/api/v1/api-keys/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    let raw: unknown = {};
    try {
      raw = await c.req.json();
    } catch {
      raw = {};
    }
    const parsed = patchApiKeyBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: validationMessage(parsed.error.issues) }, 400);
    }
    const body = parsed.data;
    if (body.expiresAt === null) {
      return c.json({ error: "expiresAt is required" }, 400);
    }

    const data: {
      name?: string;
      scopes?: string;
      restrictWorkflows?: boolean;
      canCreateWorkflows?: boolean;
      expiresAt?: Date;
      ownerEmail?: string;
      ownerName?: string;
    } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.scopes !== undefined) data.scopes = JSON.stringify(parseScopesBody(body.scopes));
    if (typeof body.restrictWorkflows === "boolean")
      data.restrictWorkflows = body.restrictWorkflows;
    if (typeof body.canCreateWorkflows === "boolean")
      data.canCreateWorkflows = body.canCreateWorkflows;
    if (typeof body.expiresAt === "string") {
      const expiry = resolveApiKeyExpiry(body.expiresAt);
      if (!expiry.ok) return c.json({ error: expiry.error }, 400);
      data.expiresAt = expiry.expiresAt;
    }
    if (typeof body.ownerEmail === "string") data.ownerEmail = body.ownerEmail;
    if (typeof body.ownerName === "string") data.ownerName = body.ownerName;

    let grants: ReturnType<typeof normalizeGrantInputs> | undefined;
    if (body.grants !== undefined) {
      grants = normalizeGrantInputs(body.grants as GrantInput[]);
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
    noteAccessLog({
      event: "key_change",
      action: "api_key.update",
      outcome: "success",
      actor: userId,
      audited: true,
    });
    void recordAudit({
      actorId: userId,
      action: "api_key.update",
      resource: "api_key",
      resourceId: id,
      detail: {
        name: k?.name,
        ownerEmail: k?.ownerEmail,
        rotationDueAt: k?.expiresAt?.toISOString() ?? null,
      },
      ip: requestIp(c),
      event: "key_change",
      outcome: "success",
    });
    return c.json(keyJson(k!));
  });

  app.delete("/api/v1/api-keys/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const existing = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    await prisma.apiKey.delete({ where: { id } });
    noteAccessLog({
      event: "key_change",
      action: "api_key.revoke",
      outcome: "success",
      actor: userId,
      audited: true,
    });
    void recordAudit({
      actorId: userId,
      action: "api_key.revoke",
      resource: "api_key",
      resourceId: id,
      detail: { name: existing.name },
      ip: requestIp(c),
      event: "key_change",
      outcome: "success",
    });
    return c.body(null, 204);
  });
}
