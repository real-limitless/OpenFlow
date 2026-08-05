import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import authRoute from "../routes/auth";
import setupRoute from "../routes/setup";
import { authMiddleware, type AppEnv } from "../middleware/auth";

const suffix = Date.now().toString(36);

describe("setup status + first owner", () => {
  let app: Hono<AppEnv>;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(() => {
    delete process.env.AUTH_DISABLED;
    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    setupRoute(app);
    authRoute(app);
  });

  afterAll(async () => {
    if (createdUserIds.length === 0) return;
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    const memberships = await prisma.projectMember.findMany({
      where: { userId: { in: createdUserIds } },
      select: { projectId: true },
    });
    for (const m of memberships) createdProjectIds.push(m.projectId);
    const projectIds = [...new Set(createdProjectIds)];
    if (projectIds.length > 0) {
      await prisma.environment.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => undefined);
      await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds }, type: "personal" } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("GET /api/v1/setup/status is public and reports needsOwner when no real users", async () => {
    const res = await app.request("/api/v1/setup/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      authDisabled: boolean;
      hasUsers: boolean;
      needsOwner: boolean;
    };
    expect(body.authDisabled).toBe(false);
    expect(typeof body.hasUsers).toBe("boolean");
    expect(body.needsOwner).toBe(!body.hasUsers);
  });

  it("first register is owner with personal project; second is member", async () => {
    const email1 = `setup-owner-${suffix}@test.local`;
    const email2 = `setup-member-${suffix}@test.local`;

    await prisma.user.deleteMany({
      where: { email: { in: [email1, email2] } },
    });

    const statusBefore = await app.request("/api/v1/setup/status");
    const before = (await statusBefore.json()) as { hasUsers: boolean; needsOwner: boolean };

    const reg1 = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email1, password: "password-owner-1" }),
    });
    expect(reg1.status).toBe(201);
    const user1 = (await reg1.json()) as { id: string; email: string; role: string };
    createdUserIds.push(user1.id);

    if (!before.hasUsers) {
      expect(user1.role).toBe("owner");
    }

    const member = await prisma.projectMember.findFirst({
      where: { userId: user1.id, project: { type: "personal" } },
    });
    expect(member).toBeTruthy();
    expect(member?.role).toBe("owner");

    const statusMid = await app.request("/api/v1/setup/status");
    const mid = (await statusMid.json()) as { hasUsers: boolean; needsOwner: boolean };
    expect(mid.hasUsers).toBe(true);
    expect(mid.needsOwner).toBe(false);

    const reg2 = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email2, password: "password-member-2" }),
    });
    expect(reg2.status).toBe(201);
    const user2 = (await reg2.json()) as { id: string; email: string; role: string };
    createdUserIds.push(user2.id);
    expect(user2.role).toBe("member");
  });
});
