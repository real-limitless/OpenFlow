import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import authRoute from "../routes/auth";
import projectsRoute from "../routes/projects";
import sharesRoute from "../routes/shares";
import credentialsRoute from "../routes/credentials";
import workflowsRoute from "../routes/workflows";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import { resolveCredential } from "../credentials";
import { encrypt } from "../crypto";

const suffix = Date.now().toString(36);

describe("E2 Gate: sharing", () => {
  let app: Hono<AppEnv>;
  let owner: { id: string };
  let grantee: { id: string };
  let tokenOwner: string;
  let tokenGrantee: string;
  let credentialId: string;
  let workflowId: string;
  let shareId: string;

  function cookie(token: string) {
    return { Cookie: `session=${token}` };
  }

  beforeAll(async () => {
    delete process.env.AUTH_DISABLED;
    process.env.CREDENTIALS_KEY = process.env.CREDENTIALS_KEY || "test-key-for-share-e2-only";

    app = new Hono<AppEnv>();
    authRoute(app);
    app.use("*", authMiddleware);
    projectsRoute(app);
    sharesRoute(app);
    credentialsRoute(app);
    workflowsRoute(app);

    async function register(email: string, password: string) {
      const res = await app.request("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      expect(res.status).toBe(201);
      const user = await res.json();
      const token = res.headers.get("set-cookie")?.match(/session=([^;]+)/)?.[1] ?? "";
      return { user, token };
    }

    const a = await register(`e2-owner-${suffix}@test.local`, "password-owner-e2");
    const b = await register(`e2-grantee-${suffix}@test.local`, "password-grantee-e2");
    owner = a.user;
    grantee = b.user;
    tokenOwner = a.token;
    tokenGrantee = b.token;
  });

  afterAll(async () => {
    if (shareId) await prisma.share.deleteMany({ where: { id: shareId } });
    await prisma.share.deleteMany({
      where: { resourceId: { in: [credentialId, workflowId].filter(Boolean) } },
    });
    if (credentialId) await prisma.credential.deleteMany({ where: { id: credentialId } });
    if (workflowId) {
      await prisma.execution.deleteMany({ where: { workflowId } });
      await prisma.workflow.deleteMany({ where: { id: workflowId } });
    }
    for (const u of [owner, grantee]) {
      if (!u?.id) continue;
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.projectMember.deleteMany({ where: { userId: u.id } });
      const personal = await prisma.project.findMany({
        where: { type: "personal", members: { some: { userId: u.id } } },
      });
      for (const p of personal) {
        await prisma.credential.deleteMany({ where: { projectId: p.id } });
        await prisma.workflow.deleteMany({ where: { projectId: p.id } });
        await prisma.project.delete({ where: { id: p.id } }).catch(() => undefined);
      }
      await prisma.user.deleteMany({ where: { id: u.id } });
    }
  });

  it("owner creates credential and shares use with grantee", async () => {
    const create = await app.request("/api/v1/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie(tokenOwner) },
      body: JSON.stringify({
        name: `e2-cred-${suffix}`,
        type: "httpHeaderAuth",
        data: { name: "X-Key", value: "super-secret-e2" },
      }),
    });
    expect(create.status).toBe(201);
    const cred = await create.json();
    credentialId = cred.id;

    const share = await app.request("/api/v1/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie(tokenOwner) },
      body: JSON.stringify({
        resourceType: "credential",
        resourceId: credentialId,
        permission: "use",
        email: `e2-grantee-${suffix}@test.local`,
      }),
    });
    expect(share.status).toBe(201);
    const body = await share.json();
    shareId = body.id;
    expect(body.permission).toBe("use");
  });

  it("grantee sees credential in list with includeUse; no secret fields", async () => {
    const list = await app.request("/api/v1/credentials?includeUse=1", {
      headers: cookie(tokenGrantee),
    });
    expect(list.status).toBe(200);
    const items = await list.json();
    const found = items.find((c: { id: string }) => c.id === credentialId);
    expect(found).toBeTruthy();
    expect(found.shared).toBe(true);
    expect(found.data).toBeUndefined();
    expect(found.dataEncrypted).toBeUndefined();
  });

  it("grantee cannot edit shared credential", async () => {
    const put = await app.request(`/api/v1/credentials/${credentialId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookie(tokenGrantee) },
      body: JSON.stringify({ name: "hacked" }),
    });
    expect(put.status).toBe(404);
  });

  it("resolveCredential decrypts for grantee via use share", async () => {
    const data = await resolveCredential(
      { id: credentialId, name: `e2-cred-${suffix}` },
      { userId: grantee.id },
    );
    expect(data).toBeTruthy();
    expect((data as { value?: string }).value).toBe("super-secret-e2");
  });

  it("workflow share grants view to grantee", async () => {
    const create = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie(tokenOwner) },
      body: JSON.stringify({
        name: `e2-wf-${suffix}`,
        active: false,
        nodes: [
          {
            id: "n1",
            name: "Manual",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
        ],
        connections: {},
      }),
    });
    expect(create.status).toBe(201);
    const wf = await create.json();
    workflowId = wf.id;

    const share = await app.request("/api/v1/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie(tokenOwner) },
      body: JSON.stringify({
        resourceType: "workflow",
        resourceId: workflowId,
        permission: "view",
        granteeUserId: grantee.id,
      }),
    });
    expect(share.status).toBe(201);

    const get = await app.request(`/api/v1/workflows/${workflowId}`, {
      headers: cookie(tokenGrantee),
    });
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.name).toContain("e2-wf-");

    const del = await app.request(`/api/v1/workflows/${workflowId}`, {
      method: "DELETE",
      headers: cookie(tokenGrantee),
    });
    expect(del.status).toBe(404);
  });
});
