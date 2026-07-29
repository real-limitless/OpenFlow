import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { encrypt } from "../crypto";

export default function credentialsRoute(app: Hono<AppEnv>) {
  // POST /api/v1/credentials — create a credential
  app.post("/api/v1/credentials", async (c) => {
    const userId = c.get("userId");
    const { name, type, data } = await c.req.json<{
      name?: string;
      type?: string;
      data?: unknown;
    }>();

    if (!name || !type || !data) {
      return c.json({ error: "name, type, and data required" }, 400);
    }

    const dataEncrypted = encrypt(JSON.stringify(data));

    const credential = await prisma.credential.create({
      data: { userId, name, type, dataEncrypted },
      select: { id: true, name: true, type: true, createdAt: true },
    });

    return c.json(credential, 201);
  });

  // GET /api/v1/credentials — list all credentials (metadata only)
  app.get("/api/v1/credentials", async (c) => {
    const userId = c.get("userId");

    const credentials = await prisma.credential.findMany({
      where: { userId },
      select: { id: true, name: true, type: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return c.json(credentials);
  });

  // GET /api/v1/credentials/:id — single credential metadata
  app.get("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const credential = await prisma.credential.findFirst({
      where: { id, userId },
      select: { id: true, name: true, type: true, createdAt: true },
    });
    if (!credential) return c.json({ error: "Not found" }, 404);

    return c.json(credential);
  });

  // PUT /api/v1/credentials/:id — update name and/or re-encrypt data
  app.put("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const existing = await prisma.credential.findFirst({ where: { id, userId } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    const { name, data } = await c.req.json<{ name?: string; data?: unknown }>();

    const update: { name?: string; dataEncrypted?: string } = {};
    if (name !== undefined) update.name = name;
    if (data !== undefined) update.dataEncrypted = encrypt(JSON.stringify(data));

    const credential = await prisma.credential.update({
      where: { id },
      data: update,
      select: { id: true, name: true, type: true, createdAt: true },
    });

    return c.json(credential);
  });

  // DELETE /api/v1/credentials/:id — remove credential
  app.delete("/api/v1/credentials/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const existing = await prisma.credential.findFirst({ where: { id, userId } });
    if (!existing) return c.json({ error: "Not found" }, 404);

    await prisma.credential.delete({ where: { id } });
    return c.json({ success: true });
  });
}
