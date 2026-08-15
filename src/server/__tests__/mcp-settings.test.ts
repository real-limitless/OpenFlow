import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import instanceSettingsRoute from "../routes/instance-settings";
import openflowMcpRoute from "../mcp/openflow-server";
import {
  invalidateInstanceSettingsCache,
  MCP_ENABLED_KEY,
} from "../services/instance-settings";

describe("MCP settings API", () => {
  let app: Hono<AppEnv>;
  const prevMcp = process.env.OPENFLOW_MCP_ENABLED;
  const prevAuth = process.env.AUTH_DISABLED;

  beforeAll(() => {
    process.env.AUTH_DISABLED = "true";
    delete process.env.OPENFLOW_MCP_ENABLED;
    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    instanceSettingsRoute(app);
    openflowMcpRoute(app);
  });

  afterAll(async () => {
    if (prevMcp === undefined) delete process.env.OPENFLOW_MCP_ENABLED;
    else process.env.OPENFLOW_MCP_ENABLED = prevMcp;
    if (prevAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prevAuth;
    await prisma.instanceSetting.deleteMany({ where: { key: MCP_ENABLED_KEY } }).catch(() => {});
    invalidateInstanceSettingsCache();
  });

  beforeEach(async () => {
    delete process.env.OPENFLOW_MCP_ENABLED;
    await prisma.instanceSetting.deleteMany({ where: { key: MCP_ENABLED_KEY } }).catch(() => {});
    invalidateInstanceSettingsCache();
  });

  it("GET returns mcp url and tools", async () => {
    const res = await app.request("http://localhost/api/v1/settings/mcp");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.mcpUrl).toContain("/mcp");
    expect(body.scopes).toContain("openflow:read");
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.some((t: { name: string }) => t.name === "list_workflows")).toBe(true);
    expect(body.canManage).toBe(true);
  });

  it("PUT disables MCP and /mcp returns 503", async () => {
    const put = await app.request("http://localhost/api/v1/settings/mcp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(put.status).toBe(200);
    const body = await put.json();
    expect(body.enabled).toBe(false);

    const mcp = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
      }),
    });
    expect(mcp.status).toBe(503);
  });

  it("env kill-switch blocks enable", async () => {
    process.env.OPENFLOW_MCP_ENABLED = "false";
    invalidateInstanceSettingsCache();

    const put = await app.request("http://localhost/api/v1/settings/mcp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(put.status).toBe(400);

    const get = await app.request("http://localhost/api/v1/settings/mcp");
    const body = await get.json();
    expect(body.enabled).toBe(false);
    expect(body.envDisabled).toBe(true);
  });
});
