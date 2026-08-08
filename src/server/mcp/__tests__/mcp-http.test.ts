import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { authMiddleware, type AppEnv } from "../../middleware/auth";
import openflowMcpRoute from "../openflow-server";
import oauthRoute from "../../routes/oauth";

describe("MCP HTTP", () => {
  let app: Hono<AppEnv>;

  beforeAll(() => {
    process.env.AUTH_DISABLED = "true";
    process.env.OPENFLOW_MCP_ENABLED = "true";
    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    oauthRoute(app);
    openflowMcpRoute(app);
  });

  it("serves OAuth AS metadata", async () => {
    const res = await app.request("http://localhost/.well-known/oauth-authorization-server");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorization_endpoint).toContain("/authorize");
    expect(body.token_endpoint).toContain("/token");
    expect(body.registration_endpoint).toContain("/register");
    expect(body.code_challenge_methods_supported).toContain("S256");
  });

  it("initializes MCP and lists tools", async () => {
    const init = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
    });
    expect(init.status).toBe(200);
    const sessionId = init.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeTruthy();
    const initBody = await init.json();
    expect(initBody.result.serverInfo.name).toBe("openflow");

    const list = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Mcp-Session-Id": sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    const names = listBody.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("list_workflows");
    expect(names).toContain("execute_workflow");
  });

  it("returns 202 for initialized notification", async () => {
    const res = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
    expect(res.status).toBe(202);
  });
});
