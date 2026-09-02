import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../db";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import executionsRoute from "../routes/executions";
import { ensureUserWithProject, LOCAL_USER_ID } from "../services/users";
import { invalidateInstanceSettingsCache } from "../services/instance-settings";

function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

describe("runtime execution ingest", () => {
  let app: Hono<AppEnv>;
  let workflowId: string;
  const prevAuth = process.env.AUTH_DISABLED;
  const createdKeyIds: string[] = [];

  beforeAll(async () => {
    delete process.env.AUTH_DISABLED;
    invalidateInstanceSettingsCache();

    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    executionsRoute(app);

    const { projectId } = await ensureUserWithProject(LOCAL_USER_ID);
    const wf = await prisma.workflow.create({
      data: {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        projectId,
        name: "Ingest WF",
        active: false,
        versionId: crypto.randomUUID(),
        nodes: "[]",
        connections: "{}",
      },
    });
    workflowId = wf.id;
  });

  afterAll(async () => {
    if (prevAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prevAuth;
    await prisma.apiKey.deleteMany({ where: { id: { in: createdKeyIds } } }).catch(() => {});
    await prisma.execution.deleteMany({ where: { workflowId } }).catch(() => {});
    await prisma.workflow.deleteMany({ where: { id: workflowId } }).catch(() => {});
    invalidateInstanceSettingsCache();
  });

  async function makeKey(opts: {
    restrict: boolean;
    grants?: { workflowId: string; canExecute?: boolean; canRead?: boolean }[];
    scopes?: string[];
  }) {
    const raw = "of_" + randomBytes(16).toString("hex");
    const row = await prisma.apiKey.create({
      data: {
        userId: LOCAL_USER_ID,
        name: `ingest-${Date.now()}`,
        keyHash: hashKey(raw),
        scopes: JSON.stringify(
          opts.scopes ?? ["openflow:read", "openflow:write", "openflow:execute"],
        ),
        restrictWorkflows: opts.restrict,
        grants:
          opts.grants && opts.grants.length > 0
            ? {
                create: opts.grants.map((g) => ({
                  workflowId: g.workflowId,
                  canRead: g.canRead !== false,
                  canWrite: false,
                  canExecute: Boolean(g.canExecute),
                })),
              }
            : undefined,
      },
    });
    createdKeyIds.push(row.id);
    return raw;
  }

  const sampleRunData = {
    Start: { status: "success", items: [[{ json: { ok: true } }]] },
    Agent: {
      status: "success",
      items: [[{ json: { output: "plan", authorization: "Bearer secret-token" } }]],
    },
  };

  it("creates a runtime execution when the key has execute grant", async () => {
    const key = await makeKey({
      restrict: true,
      grants: [{ workflowId, canExecute: true }],
    });
    const res = await app.request(`/api/v1/workflows/${workflowId}/executions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        status: "success",
        runData: sampleRunData,
        host: "cleanflow",
        stageId: "orchestrate",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.mode).toBe("runtime");
    expect(json.workflowId).toBe(workflowId);

    const row = await prisma.execution.findUnique({ where: { id: json.id } });
    expect(row?.mode).toBe("runtime");
    const stored = JSON.parse(row?.runData ?? "{}");
    expect(stored.Agent.items[0][0].json.authorization).toBe("********");
    expect(stored.Agent.items[0][0].json.output).toBe("plan");
    expect(JSON.parse(row?.meta ?? "{}")).toMatchObject({
      host: "cleanflow",
      stageId: "orchestrate",
    });
  });

  it("rejects missing token", async () => {
    const res = await app.request(`/api/v1/workflows/${workflowId}/executions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "success", runData: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a key without execute scope", async () => {
    const key = await makeKey({
      restrict: false,
      scopes: ["openflow:read"],
    });
    const res = await app.request(`/api/v1/workflows/${workflowId}/executions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ status: "success", runData: {} }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a restricted key without canExecute", async () => {
    const key = await makeKey({
      restrict: true,
      grants: [{ workflowId, canExecute: false, canRead: true }],
    });
    const res = await app.request(`/api/v1/workflows/${workflowId}/executions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ status: "success", runData: {} }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown workflow", async () => {
    const key = await makeKey({ restrict: false });
    const res = await app.request(`/api/v1/workflows/does-not-exist/executions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ status: "success", runData: {} }),
    });
    expect(res.status).toBe(404);
  });

  it("stores failed harness runs", async () => {
    const key = await makeKey({ restrict: false });
    const res = await app.request(`/api/v1/workflows/${workflowId}/executions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        status: "error",
        error: { message: "Agent timed out" },
        runData: { Agent: { status: "error", error: "timeout" } },
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    const row = await prisma.execution.findUnique({ where: { id: json.id } });
    expect(row?.status).toBe("error");
    expect(row?.error).toContain("Agent timed out");
  });

  it("PATCHes a running ingest to success", async () => {
    const key = await makeKey({ restrict: false });
    const created = await app.request(`/api/v1/workflows/${workflowId}/executions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        status: "running",
        runData: { Start: { status: "running" } },
      }),
    });
    expect(created.status).toBe(201);
    const { id } = await created.json();

    const patched = await app.request(`/api/v1/executions/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        status: "success",
        runData: { Start: { status: "success" } },
      }),
    });
    expect(patched.status).toBe(200);
    const row = await prisma.execution.findUnique({ where: { id } });
    expect(row?.status).toBe("success");
  });
});
