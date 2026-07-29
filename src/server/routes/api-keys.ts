import type { Hono } from "hono";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";

export default function apiKeysRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/api-keys", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json<{ name?: string; scopes?: string[] }>();
    const { name, scopes } = body ?? {};

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return c.json({ error: "name is required" }, 400);
    }

    const rawKey = "of_" + randomBytes(32).toString("hex");
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: name.trim(),
        keyHash,
        scopes: JSON.stringify(scopes ?? []),
      },
      select: { id: true, name: true, createdAt: true },
    });

    return c.json({ ...apiKey, key: rawKey }, 201);
  });

  app.get("/api/v1/api-keys", async (c) => {
    const userId = c.get("userId");

    const keys = await prisma.apiKey.findMany({
      where: { userId },
      select: { id: true, name: true, scopes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return c.json(keys);
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
