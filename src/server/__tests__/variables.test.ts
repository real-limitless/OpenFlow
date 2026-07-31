import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import authRoute from "../routes/auth";
import variablesRoute from "../routes/variables";
import workflowsRoute from "../routes/workflows";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import { executeWorkflow } from "../../lib/engine/runner";
import { getExecutorMap } from "../../lib/engine";
import { loadVarsMap } from "../services/variables";
import { ensurePersonalProject } from "../services/projects";

const suffix = Date.now().toString(36);

describe("E3 Gate: custom variables", () => {
  let app: Hono<AppEnv>;
  let user: { id: string };
  let token: string;
  let projectId: string;
  let variableId: string;

  beforeAll(async () => {
    delete process.env.AUTH_DISABLED;
    process.env.CREDENTIALS_KEY = process.env.CREDENTIALS_KEY || "test-key-for-vars-e3";

    app = new Hono<AppEnv>();
    authRoute(app);
    app.use("*", authMiddleware);
    variablesRoute(app);
    workflowsRoute(app);

    const reg = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `e3-user-${suffix}@test.local`,
        password: "password-e3-vars",
      }),
    });
    expect(reg.status).toBe(201);
    user = await reg.json();
    token = reg.headers.get("set-cookie")?.match(/session=([^;]+)/)?.[1] ?? "";
    projectId = await ensurePersonalProject(user.id);
  });

  afterAll(async () => {
    if (variableId) await prisma.variable.deleteMany({ where: { id: variableId } });
    await prisma.variable.deleteMany({ where: { projectId } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.projectMember.deleteMany({ where: { userId: user.id } });
      await prisma.workflow.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("creates project variable and lists it", async () => {
    const create = await app.request("/api/v1/variables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        key: `greeting_${suffix.replace(/[^a-zA-Z0-9_]/g, "")}`,
        value: "hello-e3",
        scope: "project",
        projectId,
      }),
    });
    expect(create.status).toBe(201);
    const body = await create.json();
    variableId = body.id;
    expect(body.key).toContain("greeting_");
    expect(body.value).toBe("hello-e3");

    const list = await app.request("/api/v1/variables?scope=project", {
      headers: {
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
    });
    expect(list.status).toBe(200);
    const rows = await list.json();
    expect(rows.some((r: { id: string }) => r.id === variableId)).toBe(true);
  });

  it("redacts secret variables in API", async () => {
    const create = await app.request("/api/v1/variables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${token}`,
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        key: `secret_${suffix.replace(/[^a-zA-Z0-9_]/g, "")}`,
        value: "top-secret",
        scope: "project",
        projectId,
        secret: true,
      }),
    });
    expect(create.status).toBe(201);
    const body = await create.json();
    expect(body.secret).toBe(true);
    expect(body.value).toBe("••••••••");

    const map = await loadVarsMap(projectId);
    expect(map[body.key]).toBe("top-secret");

    await prisma.variable.delete({ where: { id: body.id } });
  });

  it("engine resolves $vars in node parameters", async () => {
    const key = `greeting_${suffix.replace(/[^a-zA-Z0-9_]/g, "")}`;
    const vars = await loadVarsMap(projectId);
    expect(vars[key]).toBe("hello-e3");

    const result = await executeWorkflow({
      workflow: {
        id: "e3-test",
        name: "e3",
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
              duplicateItem: false,
              assignments: {
                assignments: [
                  {
                    id: "a1",
                    name: "msg",
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
      vars,
    });

    expect(result.success).toBe(true);
    const setData = result.runData["Set"];
    expect(setData?.status).toBe("success");
    const items =
      (setData as { items?: Array<Array<{ json?: { msg?: string } }>> })?.items?.[0] ??
      setData?.data?.main?.[0] ??
      [];
    expect(items[0]?.json?.msg).toBe("hello-e3");
  });
});
