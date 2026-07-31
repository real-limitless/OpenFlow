import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import authRoute from "../routes/auth";
import workflowsRoute from "../routes/workflows";
import credentialsRoute from "../routes/credentials";
import apiKeysRoute from "../routes/api-keys";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import { createSession, hashToken } from "../services/sessions";

const suffix = Date.now().toString(36);

describe("E0 Gate: auth ownership isolation", () => {
  let app: Hono<AppEnv>;
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let tokenA: string;
  let tokenB: string;
  let workflowAId: string;
  let credentialAId: string;
  let apiKeyRaw: string;

  beforeAll(async () => {
    delete process.env.AUTH_DISABLED;

    app = new Hono<AppEnv>();
    authRoute(app);
    app.use("*", authMiddleware);
    workflowsRoute(app);
    credentialsRoute(app);
    apiKeysRoute(app);

    const emailA = `e0-a-${suffix}@test.local`;
    const emailB = `e0-b-${suffix}@test.local`;

    const regA = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password: "password-a-123" }),
    });
    expect(regA.status).toBe(201);
    userA = await regA.json();
    tokenA = regA.headers.get("set-cookie")?.match(/session=([^;]+)/)?.[1] ?? "";
    expect(tokenA).toBeTruthy();

    const regB = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password: "password-b-123" }),
    });
    expect(regB.status).toBe(201);
    userB = await regB.json();
    tokenB = regB.headers.get("set-cookie")?.match(/session=([^;]+)/)?.[1] ?? "";
    expect(tokenB).toBeTruthy();
  });

  afterAll(async () => {
    if (workflowAId) {
      await prisma.execution.deleteMany({ where: { workflowId: workflowAId } });
      await prisma.workflow.deleteMany({ where: { id: workflowAId } });
    }
    if (credentialAId) {
      await prisma.credential.deleteMany({ where: { id: credentialAId } });
    }
    await prisma.apiKey.deleteMany({ where: { userId: { in: [userA?.id, userB?.id].filter(Boolean) } } });
    await prisma.session.deleteMany({ where: { userId: { in: [userA?.id, userB?.id].filter(Boolean) } } });
    if (userA?.id) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB?.id) await prisma.user.deleteMany({ where: { id: userB.id } });
  });

  it("stores session token hash in DB", async () => {
    const row = await prisma.session.findUnique({ where: { tokenHash: hashToken(tokenA) } });
    expect(row?.userId).toBe(userA.id);
  });

  it("A can create workflow; B cannot read it", async () => {
    const create = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${tokenA}`,
      },
      body: JSON.stringify({
        name: `e0-wf-${suffix}`,
        active: false,
        nodes: [{ id: "n1", name: "Manual", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} }],
        connections: {},
      }),
    });
    expect(create.status).toBe(201);
    const wf = await create.json();
    workflowAId = wf.id;
    expect(wf.name).toContain("e0-wf-");

    const asB = await app.request(`/api/v1/workflows/${workflowAId}`, {
      headers: { Cookie: `session=${tokenB}` },
    });
    expect(asB.status).toBe(404);

    const listB = await app.request("/api/v1/workflows", {
      headers: { Cookie: `session=${tokenB}` },
    });
    expect(listB.status).toBe(200);
    const list = await listB.json();
    expect(list.find((w: { id: string }) => w.id === workflowAId)).toBeUndefined();
  });

  it("A credentials are hidden from B", async () => {
    const create = await app.request("/api/v1/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${tokenA}`,
      },
      body: JSON.stringify({
        name: `e0-cred-${suffix}`,
        type: "httpHeaderAuth",
        data: { name: "X-Key", value: "secret" },
      }),
    });
    expect(create.status).toBe(201);
    const cred = await create.json();
    credentialAId = cred.id;

    const asB = await app.request(`/api/v1/credentials/${credentialAId}`, {
      headers: { Cookie: `session=${tokenB}` },
    });
    expect(asB.status).toBe(404);
  });

  it("API key auth resolves owner via SHA-256 lookup", async () => {
    const created = await app.request("/api/v1/api-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${tokenA}`,
      },
      body: JSON.stringify({ name: `e0-key-${suffix}` }),
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    apiKeyRaw = body.key;
    expect(apiKeyRaw.startsWith("of_")).toBe(true);

    const list = await app.request("/api/v1/workflows", {
      headers: { "X-API-Key": apiKeyRaw },
    });
    expect(list.status).toBe(200);
    const workflows = await list.json();
    expect(workflows.find((w: { id: string }) => w.id === workflowAId)).toBeTruthy();
  });

  it("unauthenticated requests get 401", async () => {
    const res = await app.request("/api/v1/workflows");
    expect(res.status).toBe(401);
  });

  it("createSession helper works across processes (DB)", async () => {
    const token = await createSession(userB.id);
    const me = await app.request("/api/v1/auth/me", {
      headers: { Cookie: `session=${token}` },
    });
    expect(me.status).toBe(200);
    const body = await me.json();
    expect(body.id).toBe(userB.id);
  });
});
