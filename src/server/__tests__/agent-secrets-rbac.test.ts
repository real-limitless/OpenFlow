import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../db";
import credentialsRoute from "../routes/credentials";
import variablesRoute from "../routes/variables";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../middleware/auth";
import { ensureUserWithProject } from "../services/users";

function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

describe("Agent secrets RBAC (REST)", () => {
  let app: Hono<AppEnv>;
  let userId: string;
  let classicKey: string;
  let credKey: string;
  let classicKeyId: string;
  let credKeyId: string;
  let createdCredId: string | undefined;
  let createdVarId: string | undefined;

  beforeAll(async () => {
    process.env.AUTH_DISABLED = "false";
    process.env.CREDENTIALS_KEY =
      process.env.CREDENTIALS_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    userId = `agent-rbac-${randomBytes(4).toString("hex")}`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${userId}@test.local`,
        passwordHash: "x",
        role: "user",
      },
    });
    await ensureUserWithProject(userId);

    classicKey = "of_" + randomBytes(16).toString("hex");
    credKey = "of_" + randomBytes(16).toString("hex");

    const classic = await prisma.apiKey.create({
      data: {
        userId,
        name: "classic",
        keyHash: hashKey(classicKey),
        scopes: JSON.stringify(["openflow:read", "openflow:write", "openflow:execute"]),
        restrictWorkflows: false,
      },
    });
    classicKeyId = classic.id;

    const withCred = await prisma.apiKey.create({
      data: {
        userId,
        name: "with-cred",
        keyHash: hashKey(credKey),
        scopes: JSON.stringify([
          "openflow:read",
          "openflow:write",
          "openflow:execute",
          "openflow:credentials",
          "openflow:variables",
        ]),
        restrictWorkflows: false,
      },
    });
    credKeyId = withCred.id;

    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    credentialsRoute(app);
    variablesRoute(app);
  });

  afterAll(async () => {
    if (createdCredId) {
      await prisma.credential.deleteMany({ where: { id: createdCredId } }).catch(() => {});
    }
    if (createdVarId) {
      await prisma.variable.deleteMany({ where: { id: createdVarId } }).catch(() => {});
    }
    await prisma.apiKey.deleteMany({ where: { id: { in: [classicKeyId, credKeyId] } } });
    await prisma.projectMember.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
  });

  it("API key without openflow:credentials cannot POST credentials", async () => {
    const res = await app.request("/api/v1/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${classicKey}`,
      },
      body: JSON.stringify({
        name: "blocked",
        type: "httpHeaderAuth",
        data: { name: "X", value: "secret" },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/openflow:credentials/);
  });

  it("API key with openflow:credentials can create credential (meta only)", async () => {
    const res = await app.request("/api/v1/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credKey}`,
      },
      body: JSON.stringify({
        name: "agent-created",
        type: "httpHeaderAuth",
        data: { name: "X-API-Key", value: "super-secret" },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    createdCredId = String(body.id);
    expect(body.name).toBe("agent-created");
    expect(body.data).toBeUndefined();
    expect(body.dataEncrypted).toBeUndefined();
    expect(body.value).toBeUndefined();
  });

  it("API key without openflow:variables cannot POST variables", async () => {
    const res = await app.request("/api/v1/variables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${classicKey}`,
      },
      body: JSON.stringify({ key: "BLOCKED_VAR", value: "nope", secret: true }),
    });
    expect(res.status).toBe(403);
  });

  it("API key with openflow:variables can create secret variable (redacted)", async () => {
    const res = await app.request("/api/v1/variables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credKey}`,
      },
      body: JSON.stringify({ key: "AGENT_SECRET", value: "top-secret", secret: true }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; value: unknown; secret: boolean };
    createdVarId = body.id;
    expect(body.secret).toBe(true);
    expect(body.value).toBe("••••••••");
  });
});
