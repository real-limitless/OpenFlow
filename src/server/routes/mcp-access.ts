import type { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import { ALL_MCP_SCOPES, parseScopes } from "../oauth/scopes";
import { hashOpaqueToken } from "../services/agent-policy";
import { loadWorkflowIfAllowed } from "../services/workflow-access";
import { mcpResourceUrl, publicOrigin } from "../oauth/public-url";

const MAX_TTL_SEC = 60 * 60 * 24 * 30; // 30d
const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h

export default function mcpAccessRoute(app: Hono<AppEnv>) {
  /** Mint a temporary MCP token for one workflow (editor “Share with AI”). */
  app.post("/api/v1/workflows/:id/mcp-access", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const workflowId = c.req.param("id");

    const access = await loadWorkflowIfAllowed(workflowId, userId, "editor");
    if ("error" in access) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{
      canRead?: boolean;
      canWrite?: boolean;
      canExecute?: boolean;
      expiresInSec?: number;
      name?: string;
      scopes?: string[];
    }>().catch(() => ({} as Record<string, unknown>));

    const canWrite = Boolean(body.canWrite);
    const canExecute = Boolean(body.canExecute);
    const canRead = body.canRead === false ? canWrite || canExecute : true;
    if (!canRead && !canWrite && !canExecute) {
      return c.json({ error: "At least one of canRead, canWrite, canExecute required" }, 400);
    }

    let ttl = typeof body.expiresInSec === "number" ? body.expiresInSec : DEFAULT_TTL_SEC;
    ttl = Math.min(MAX_TTL_SEC, Math.max(60, Math.floor(ttl)));
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const scopes = Array.isArray(body.scopes)
      ? parseScopes((body.scopes as string[]).join(" "))
      : [...ALL_MCP_SCOPES];

    const raw = "oft_" + randomBytes(32).toString("base64url");
    const row = await prisma.mcpTemporaryToken.create({
      data: {
        userId,
        name:
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : `Workflow ${access.row.name}`,
        tokenHash: hashOpaqueToken(raw),
        scopes: JSON.stringify(scopes),
        expiresAt,
        grants: {
          create: {
            workflowId,
            canRead,
            canWrite,
            canExecute,
            expiresAt,
          },
        },
      },
      include: { grants: true },
    });

    const origin = publicOrigin(c);
    return c.json(
      {
        id: row.id,
        token: raw,
        expiresAt: expiresAt.toISOString(),
        mcpUrl: mcpResourceUrl(origin),
        name: row.name,
        scopes,
        grants: row.grants.map((g) => ({
          workflowId: g.workflowId,
          canRead: g.canRead,
          canWrite: g.canWrite,
          canExecute: g.canExecute,
          expiresAt: g.expiresAt?.toISOString() ?? null,
        })),
      },
      201,
    );
  });

  app.get("/api/v1/mcp-access-tokens", async (c) => {
    const userId = c.get("userId");
    const rows = await prisma.mcpTemporaryToken.findMany({
      where: { userId },
      include: { grants: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return c.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        expiresAt: r.expiresAt.toISOString(),
        revokedAt: r.revokedAt?.toISOString() ?? null,
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        grants: r.grants.map((g) => ({
          workflowId: g.workflowId,
          canRead: g.canRead,
          canWrite: g.canWrite,
          canExecute: g.canExecute,
          expiresAt: g.expiresAt?.toISOString() ?? null,
        })),
      })),
    );
  });

  app.delete("/api/v1/mcp-access-tokens/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const row = await prisma.mcpTemporaryToken.findFirst({ where: { id, userId } });
    if (!row) return c.json({ error: "Not found" }, 404);
    await prisma.mcpTemporaryToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return c.body(null, 204);
  });
}
