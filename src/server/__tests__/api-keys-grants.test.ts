import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import apiKeysRoute from "../routes/api-keys";
import { ensureUserWithProject, LOCAL_USER_ID } from "../services/users";
import { createSession, hashToken } from "../services/sessions";
import { invalidateInstanceSettingsCache } from "../services/instance-settings";
import { assertAgentWorkflowAccess, resolveApiKeyAuth } from "../services/agent-policy";

describe("API key grant updates", () => {
  let app: Hono<AppEnv>;
  let wfA: string;
  let wfB: string;
  let session: string;
  const prevAuth = process.env.AUTH_DISABLED;
  const createdKeyIds: string[] = [];

  beforeAll(async () => {
    delete process.env.AUTH_DISABLED;
    invalidateInstanceSettingsCache();

    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    apiKeysRoute(app);

    const { projectId } = await ensureUserWithProject(LOCAL_USER_ID);
    session = await createSession(LOCAL_USER_ID);

    const a = await prisma.workflow.create({
      data: {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        projectId,
        name: "Grant update A",
        active: false,
        versionId: crypto.randomUUID(),
        nodes: "[]",
        connections: "{}",
      },
    });
    const b = await prisma.workflow.create({
      data: {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        projectId,
        name: "Grant update B",
        active: false,
        versionId: crypto.randomUUID(),
        nodes: "[]",
        connections: "{}",
      },
    });
    wfA = a.id;
    wfB = b.id;
  });

  afterAll(async () => {
    if (prevAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prevAuth;
    await prisma.apiKey.deleteMany({ where: { id: { in: createdKeyIds } } }).catch(() => {});
    await prisma.workflow.deleteMany({ where: { id: { in: [wfA, wfB] } } }).catch(() => {});
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(session) } }).catch(() => {});
    invalidateInstanceSettingsCache();
  });

  function cookie() {
    return { Cookie: `session=${session}`, "Content-Type": "application/json" };
  }

  it("PATCHes workflow grants after create", async () => {
    const created = await app.request("/api/v1/api-keys", {
      method: "POST",
      headers: cookie(),
      body: JSON.stringify({
        name: `grant-update-${Date.now()}`,
        restrictWorkflows: true,
        grants: [{ workflowId: wfA, canRead: true, canWrite: true, canExecute: false }],
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      id: string;
      key: string;
      grants: { workflowId: string }[];
    };
    createdKeyIds.push(createdBody.id);
    expect(createdBody.grants.map((g) => g.workflowId)).toEqual([wfA]);

    const patched = await app.request(`/api/v1/api-keys/${createdBody.id}`, {
      method: "PATCH",
      headers: cookie(),
      body: JSON.stringify({
        restrictWorkflows: true,
        grants: [
          { workflowId: wfA, canRead: true, canWrite: true, canExecute: true },
          { workflowId: wfB, canRead: true, canWrite: false, canExecute: false },
        ],
      }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as {
      grants: { workflowId: string; canExecute: boolean; canWrite: boolean }[];
    };
    const byId = Object.fromEntries(patchedBody.grants.map((g) => [g.workflowId, g]));
    expect(byId[wfA]?.canExecute).toBe(true);
    expect(byId[wfB]?.canWrite).toBe(false);

    const authAfterAdd = await resolveApiKeyAuth(createdBody.key);
    expect(authAfterAdd?.workflowPolicy.mode).toBe("grants");
    expect(() =>
      assertAgentWorkflowAccess(authAfterAdd!.workflowPolicy, wfA, "execute"),
    ).not.toThrow();
    expect(() =>
      assertAgentWorkflowAccess(authAfterAdd!.workflowPolicy, wfB, "read"),
    ).not.toThrow();

    const cleared = await app.request(`/api/v1/api-keys/${createdBody.id}`, {
      method: "PATCH",
      headers: cookie(),
      body: JSON.stringify({ grants: [{ workflowId: wfB, canRead: true }] }),
    });
    expect(cleared.status).toBe(200);

    const authAfterClear = await resolveApiKeyAuth(createdBody.key);
    expect(() => assertAgentWorkflowAccess(authAfterClear!.workflowPolicy, wfA, "read")).toThrow();
    expect(() =>
      assertAgentWorkflowAccess(authAfterClear!.workflowPolicy, wfB, "read"),
    ).not.toThrow();
  });
});
