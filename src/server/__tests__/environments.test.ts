import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import authRoute from "../routes/auth";
import environmentsRoute from "../routes/environments";
import variablesRoute from "../routes/variables";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import { ensurePersonalProject } from "../services/projects";
import { loadVarsMap } from "../services/variables";
import { executeWorkflow } from "../../lib/engine/runner";
import { getExecutorMap } from "../../lib/engine";

const suffix = Date.now().toString(36);

describe("E4 Gate: environments", () => {
  let app: Hono<AppEnv>;
  let user: { id: string };
  let token: string;
  let projectId: string;
  let prodId: string;
  let devId: string;

  beforeAll(async () => {
    delete process.env.AUTH_DISABLED;
    process.env.CREDENTIALS_KEY = process.env.CREDENTIALS_KEY || "test-key-for-env-e4";

    app = new Hono<AppEnv>();
    authRoute(app);
    app.use("*", authMiddleware);
    environmentsRoute(app);
    variablesRoute(app);

    const reg = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `e4-user-${suffix}@test.local`,
        password: "password-e4-env",
      }),
    });
    expect(reg.status).toBe(201);
    user = await reg.json();
    token = reg.headers.get("set-cookie")?.match(/session=([^;]+)/)?.[1] ?? "";
    projectId = await ensurePersonalProject(user.id);
  });

  afterAll(async () => {
    await prisma.variable.deleteMany({ where: { projectId } });
    await prisma.environment.deleteMany({ where: { projectId } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.projectMember.deleteMany({ where: { userId: user.id } });
      await prisma.project.deleteMany({ where: { id: projectId } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("lists default environments for project", async () => {
    const res = await app.request("/api/v1/environments", {
      headers: {
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
    });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.length).toBeGreaterThanOrEqual(3);
    const slugs = list.map((e: { slug: string }) => e.slug);
    expect(slugs).toContain("development");
    expect(slugs).toContain("staging");
    expect(slugs).toContain("production");
    const prod = list.find((e: { slug: string }) => e.slug === "production");
    const dev = list.find((e: { slug: string }) => e.slug === "development");
    expect(prod.isDefault).toBe(true);
    prodId = prod.id;
    devId = dev.id;
  });

  it("env overrides beat base vars in loadVarsMap", async () => {
    const key = `apiUrl_${suffix.replace(/[^a-zA-Z0-9_]/g, "")}`;

    const base = await app.request("/api/v1/variables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        key,
        value: "https://prod.example.com",
        scope: "project",
        projectId,
        environmentId: null,
      }),
    });
    expect(base.status).toBe(201);

    const override = await app.request("/api/v1/variables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        key,
        value: "https://dev.example.com",
        scope: "project",
        projectId,
        environmentId: devId,
      }),
    });
    expect(override.status).toBe(201);

    const prodMap = await loadVarsMap(projectId, prodId);
    expect(prodMap[key]).toBe("https://prod.example.com");

    const devMap = await loadVarsMap(projectId, devId);
    expect(devMap[key]).toBe("https://dev.example.com");

    const result = await executeWorkflow({
      workflow: {
        id: "e4-test",
        name: "e4",
        active: false,
        nodes: [
          {
            id: "m1",
            name: "Manual",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
          {
            id: "s1",
            name: "Set",
            type: "n8n-nodes-base.set",
            typeVersion: 3.4,
            position: [200, 0],
            parameters: {
              mode: "manual",
              assignments: {
                assignments: [
                  {
                    id: "a1",
                    name: "url",
                    value: `={{ $vars.${key} }}`,
                    type: "string",
                  },
                ],
              },
              options: {},
            },
          },
        ],
        connections: {
          Manual: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        },
        settings: {},
        versionId: "1",
      },
      nodeExecutors: getExecutorMap(),
      vars: devMap,
    });
    expect(result.success).toBe(true);
    const items =
      (result.runData["Set"] as { items?: Array<Array<{ json?: { url?: string } }>> })
        ?.items?.[0] ?? [];
    expect(items[0]?.json?.url).toBe("https://dev.example.com");
  });
});
