import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import {
  agentMayManageCredentials,
} from "../services/agent-policy";
import {
  createCredential,
  deleteCredential,
  isServiceError,
  listCredentialsMeta,
  updateCredential,
} from "../services/credentials-admin";
import { prisma } from "../db";
import { requireResourceAccess } from "../services/shares";
import { projectIdFromRequest } from "../services/projects";

export default function credentialsRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/credentials", async (c) => {
    const userId = c.get("userId");
    const authKind = c.get("authKind");
    const scopes = c.get("scopes");
    if (!agentMayManageCredentials({ authKind, scopes })) {
      return c.json(
        {
          error:
            "Missing scope openflow:credentials. Opt in when minting the API key / OAuth / temporary MCP token.",
        },
        403,
      );
    }

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

    const result = await createCredential(userId, {
      name,
      type,
      data: data as Record<string, unknown>,
      projectId: body.projectId || projectIdFromRequest(c),
      secretProviderId: body.secretProviderId,
      externalRef: body.externalRef,
    });
    if (isServiceError(result)) return c.json({ error: result.error }, result.status as 400);
    return c.json(result, 201);
  });

  app.get("/api/v1/credentials", async (c) => {
    const userId = c.get("userId");
    const filterProjectId = projectIdFromRequest(c);
    const type = c.req.query("type") || undefined;
    const includeUse = c.req.query("includeUse") === "1" || c.req.query("includeUse") === "true";

    try {
      const rows = await listCredentialsMeta(userId, {
        projectId: filterProjectId,
        type,
        includeUse,
      });
      return c.json(rows);
    } catch (err) {
      const e = err as { serviceError?: { error: string; status: number }; message?: string };
      if (e.serviceError) {
        return c.json({ error: e.serviceError.error }, e.serviceError.status as 403);
      }
      throw err;
    }
  });

  app.get("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const credential = await prisma.credential.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        projectId: true,
        secretProviderId: true,
        externalRef: true,
        createdAt: true,
      },
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
      id: credential.id,
      name: credential.name,
      type: credential.type,
      projectId: credential.projectId,
      secretProviderId: credential.secretProviderId ?? null,
      externalRef: credential.externalRef ?? null,
      external: Boolean(credential.secretProviderId && credential.externalRef),
      shared: access.via === "share",
      sharePermission: access.via === "share" ? access.permission : undefined,
      createdAt: credential.createdAt.toISOString(),
    });
  });

  app.put("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const authKind = c.get("authKind");
    const scopes = c.get("scopes");
    if (!agentMayManageCredentials({ authKind, scopes })) {
      return c.json(
        {
          error:
            "Missing scope openflow:credentials. Opt in when minting the API key / OAuth / temporary MCP token.",
        },
        403,
      );
    }

    const { id } = c.req.param();
    const body = await c.req.json<{
      name?: string;
      data?: unknown;
      secretProviderId?: string | null;
      externalRef?: string | null;
    }>();

    const result = await updateCredential(userId, id, {
      name: body.name,
      data:
        body.data !== undefined
          ? (body.data as Record<string, unknown>)
          : undefined,
      secretProviderId: body.secretProviderId,
      externalRef: body.externalRef,
    });
    if (isServiceError(result)) return c.json({ error: result.error }, result.status as 404);
    return c.json(result);
  });

  app.delete("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const authKind = c.get("authKind");
    const scopes = c.get("scopes");
    if (!agentMayManageCredentials({ authKind, scopes })) {
      return c.json(
        {
          error:
            "Missing scope openflow:credentials. Opt in when minting the API key / OAuth / temporary MCP token.",
        },
        403,
      );
    }

    const { id } = c.req.param();
    const result = await deleteCredential(userId, id);
    if (isServiceError(result)) return c.json({ error: result.error }, result.status as 404);
    return c.json(result);
  });
}
