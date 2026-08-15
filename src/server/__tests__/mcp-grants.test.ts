import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import openflowMcpRoute from "../mcp/openflow-server";
import mcpAccessRoute from "../routes/mcp-access";
import { ensureUserWithProject, LOCAL_USER_ID } from "../services/users";
import { invalidateInstanceSettingsCache } from "../services/instance-settings";

function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

async function mcpCall(
  app: Hono<AppEnv>,
  auth: string,
  name: string,
  args: Record<string, unknown> = {},
  workflowId?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth}`,
  };
  if (workflowId) headers["X-OpenFlow-Workflow-Id"] = workflowId;
  const res = await app.request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe("MCP workflow grants", () => {
  let app: Hono<AppEnv>;
  let wfA: string;
  let wfB: string;
  const prevAuth = process.env.AUTH_DISABLED;
  const prevMcp = process.env.OPENFLOW_MCP_ENABLED;
  const createdKeyIds: string[] = [];

  beforeAll(async () => {
    // Real auth so API keys apply policy (not unrestricted local)
    delete process.env.AUTH_DISABLED;
    delete process.env.OPENFLOW_MCP_ENABLED;
    invalidateInstanceSettingsCache();

    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    mcpAccessRoute(app);
    openflowMcpRoute(app);

    await ensureUserWithProject(LOCAL_USER_ID);
    const { projectId } = await ensureUserWithProject(LOCAL_USER_ID);

    const a = await prisma.workflow.create({
      data: {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        projectId,
        name: "Grant WF A",
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
        name: "Grant WF B",
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
    if (prevMcp === undefined) delete process.env.OPENFLOW_MCP_ENABLED;
    else process.env.OPENFLOW_MCP_ENABLED = prevMcp;

    await prisma.apiKey.deleteMany({ where: { id: { in: createdKeyIds } } }).catch(() => {});
    await prisma.workflow.deleteMany({ where: { id: { in: [wfA, wfB] } } }).catch(() => {});
    invalidateInstanceSettingsCache();
  });

  beforeEach(() => {
    invalidateInstanceSettingsCache();
  });

  async function makeKey(opts: {
    restrict: boolean;
    grants?: { workflowId: string; canRead?: boolean; canWrite?: boolean; canExecute?: boolean }[];
    scopes?: string[];
  }) {
    const raw = "of_" + randomBytes(16).toString("hex");
    const row = await prisma.apiKey.create({
      data: {
        userId: LOCAL_USER_ID,
        name: `test-${Date.now()}`,
        keyHash: hashKey(raw),
        scopes: JSON.stringify(opts.scopes ?? ["openflow:read", "openflow:write", "openflow:execute"]),
        restrictWorkflows: opts.restrict,
        grants:
          opts.grants && opts.grants.length > 0
            ? {
                create: opts.grants.map((g) => ({
                  workflowId: g.workflowId,
                  canRead: g.canRead !== false,
                  canWrite: Boolean(g.canWrite),
                  canExecute: Boolean(g.canExecute),
                })),
              }
            : undefined,
      },
    });
    createdKeyIds.push(row.id);
    return raw;
  }

  it("restricted key with no grants lists empty workflows", async () => {
    const key = await makeKey({ restrict: true, grants: [] });
    const { status, body } = await mcpCall(app, key, "list_workflows", {});
    expect(status).toBe(200);
    expect(body.result?.isError).not.toBe(true);
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed.items).toEqual([]);
  });

  it("restricted key only opens granted workflow", async () => {
    const key = await makeKey({
      restrict: true,
      grants: [{ workflowId: wfA, canRead: true, canWrite: true, canExecute: false }],
    });

    const ok = await mcpCall(app, key, "get_workflow", {}, wfA);
    expect(ok.body.result?.isError).not.toBe(true);

    const denied = await mcpCall(app, key, "get_workflow", {}, wfB);
    expect(denied.body.result?.isError).toBe(true);
    expect(String(denied.body.result.content[0].text)).toMatch(/No MCP grant|access denied/i);
  });

  it("read-only grant blocks execute", async () => {
    const key = await makeKey({
      restrict: true,
      grants: [{ workflowId: wfA, canRead: true, canWrite: false, canExecute: false }],
    });
    const { body } = await mcpCall(app, key, "execute_workflow", {}, wfA);
    expect(body.result?.isError).toBe(true);
    expect(String(body.result.content[0].text)).toMatch(/execute|lacks/i);
  });

  it("unrestricted key can open both workflows", async () => {
    const key = await makeKey({ restrict: false });
    const a = await mcpCall(app, key, "get_workflow", {}, wfA);
    const b = await mcpCall(app, key, "get_workflow", {}, wfB);
    expect(a.body.result?.isError).not.toBe(true);
    expect(b.body.result?.isError).not.toBe(true);
  });
});
