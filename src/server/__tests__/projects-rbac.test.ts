import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import authRoute from "../routes/auth";
import projectsRoute from "../routes/projects";
import workflowsRoute from "../routes/workflows";
import { authMiddleware, type AppEnv } from "../middleware/auth";

const suffix = Date.now().toString(36);

describe("E1 Gate: projects + RBAC", () => {
  let app: Hono<AppEnv>;
  let owner: { id: string };
  let viewer: { id: string };
  let outsider: { id: string };
  let tokenOwner: string;
  let tokenViewer: string;
  let tokenOutsider: string;
  let projectId: string;
  let workflowId: string;

  function cookie(token: string) {
    return { Cookie: `session=${token}` };
  }

  beforeAll(async () => {
    delete process.env.AUTH_DISABLED;
    app = new Hono<AppEnv>();
    authRoute(app);
    app.use("*", authMiddleware);
    projectsRoute(app);
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
      expect(token).toBeTruthy();
      return { user, token };
    }

    const a = await register(`e1-owner-${suffix}@test.local`, "password-owner-1");
    const b = await register(`e1-viewer-${suffix}@test.local`, "password-viewer-1");
    const c = await register(`e1-out-${suffix}@test.local`, "password-out-1");
    owner = a.user;
    viewer = b.user;
    outsider = c.user;
    tokenOwner = a.token;
    tokenViewer = b.token;
    tokenOutsider = c.token;
  });

  afterAll(async () => {
    if (workflowId) {
      await prisma.execution.deleteMany({ where: { workflowId } });
      await prisma.workflow.deleteMany({ where: { id: workflowId } });
    }
    if (projectId) {
      await prisma.projectMember.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    for (const u of [owner, viewer, outsider]) {
      if (!u?.id) continue;
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.projectMember.deleteMany({ where: { userId: u.id } });
      const personal = await prisma.project.findMany({
        where: { type: "personal", members: { some: { userId: u.id } } },
      });
      for (const p of personal) {
        await prisma.workflow.deleteMany({ where: { projectId: p.id } });
        await prisma.credential.deleteMany({ where: { projectId: p.id } });
        await prisma.dataTable.deleteMany({ where: { projectId: p.id } });
        await prisma.project.delete({ where: { id: p.id } }).catch(() => undefined);
      }
      await prisma.user.deleteMany({ where: { id: u.id } });
    }
  });

  it("creates team project and lists it", async () => {
    const res = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie(tokenOwner) },
      body: JSON.stringify({ name: `E1 Team ${suffix}` }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    projectId = body.id;
    expect(body.role).toBe("owner");

    const list = await app.request("/api/v1/projects", { headers: cookie(tokenOwner) });
    expect(list.status).toBe(200);
    const projects = await list.json();
    expect(projects.some((p: { id: string }) => p.id === projectId)).toBe(true);
  });

  it("adds viewer member; outsider cannot see project", async () => {
    const add = await app.request(`/api/v1/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie(tokenOwner) },
      body: JSON.stringify({ userId: viewer.id, role: "viewer" }),
    });
    expect(add.status).toBe(201);

    const asOut = await app.request(`/api/v1/projects/${projectId}`, {
      headers: cookie(tokenOutsider),
    });
    expect(asOut.status).toBe(403);

    const asViewer = await app.request(`/api/v1/projects/${projectId}`, {
      headers: cookie(tokenViewer),
    });
    expect(asViewer.status).toBe(200);
    const detail = await asViewer.json();
    expect(detail.role).toBe("viewer");
  });

  it("viewer can list workflows but cannot create", async () => {
    const create = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookie(tokenOwner),
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        name: `e1-wf-${suffix}`,
        active: false,
        projectId,
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

    const listV = await app.request("/api/v1/workflows", {
      headers: { ...cookie(tokenViewer), "X-OpenFlow-Project": projectId },
    });
    expect(listV.status).toBe(200);
    const items = await listV.json();
    expect(items.find((w: { id: string }) => w.id === workflowId)).toBeTruthy();

    const createV = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookie(tokenViewer),
        "X-OpenFlow-Project": projectId,
      },
      body: JSON.stringify({
        name: "should-fail",
        active: false,
        projectId,
        nodes: [],
        connections: {},
      }),
    });
    expect(createV.status).toBe(403);

    const getOut = await app.request(`/api/v1/workflows/${workflowId}`, {
      headers: cookie(tokenOutsider),
    });
    expect(getOut.status).toBe(404);
  });
});
