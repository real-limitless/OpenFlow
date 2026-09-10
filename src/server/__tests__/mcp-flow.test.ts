import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import { authMiddleware, type AppEnv } from "../middleware/auth";
import mcpFlowRoute from "../routes/mcp-flow";
import { setMcpFlowGatewayHttpClient } from "../../lib/nodes/mcp-flow/gateway";
import type { SdkHttpResponse } from "@/sdk";

async function withRetry<T>(fn: () => Promise<T> | T, attempts = 10, delayMs = 200): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timed out") || msg.includes("busy") || msg.includes("write")) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

function rpcResponse(id: number, result: unknown): SdkHttpResponse {
  return { status: 200, headers: {}, body: { jsonrpc: "2.0", id, result } };
}

function toolContent(obj: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

describe("mcp-flow connection API", () => {
  let app: Hono<AppEnv>;
  const prevAuth = process.env.AUTH_DISABLED;
  const prevKey = process.env.CREDENTIALS_KEY;
  const credentialIds: string[] = [];

  beforeAll(async () => {
    process.env.AUTH_DISABLED = "true";
    process.env.CREDENTIALS_KEY = "test-key-for-mcp-flow-connection";
    await withRetry(() =>
      prisma.user.upsert({
        where: { id: "local" },
        update: { email: "mcp-flow@local.test" },
        create: { id: "local", email: "mcp-flow@local.test", passwordHash: "hashed" },
      }),
    );
    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    mcpFlowRoute(app);
  });

  afterEach(() => setMcpFlowGatewayHttpClient(null));

  afterAll(async () => {
    setMcpFlowGatewayHttpClient(null);
    if (credentialIds.length) {
      await withRetry(() => prisma.credential.deleteMany({ where: { id: { in: credentialIds } } }));
    }
    await withRetry(() =>
      prisma.credential.deleteMany({ where: { userId: "local", type: "mcpFlowApi" } }),
    );
    if (prevAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prevAuth;
    if (prevKey === undefined) delete process.env.CREDENTIALS_KEY;
    else process.env.CREDENTIALS_KEY = prevKey;
  });

  it("GET connection is disconnected before save", async () => {
    const res = await app.request("/api/v1/mcp-flow/connection");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connected).toBe(false);
  });

  it("PUT saves credential metadata without echoing the secret", async () => {
    const put = await app.request("/api/v1/mcp-flow/connection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1:8787", apiKey: "mf_super_secret" }),
    });
    expect(put.status).toBe(200);
    const body = await put.json();
    credentialIds.push(body.id);
    expect(body.url).toBe("http://127.0.0.1:8787");
    expect(JSON.stringify(body)).not.toContain("mf_super_secret");
    expect(body.apiKey).toBeUndefined();

    const get = await app.request("/api/v1/mcp-flow/connection");
    const listed = await get.json();
    expect(listed.connected).toBe(true);
    expect(listed.credential.url).toBe("http://127.0.0.1:8787");
    expect(JSON.stringify(listed)).not.toContain("mf_super_secret");
  });

  it("lists backends through the mocked gateway", async () => {
    setMcpFlowGatewayHttpClient(async (opts) => {
      const body = opts.body as { id?: number; method: string; params?: { name?: string } };
      const id = body.id ?? 0;
      if (body.method === "initialize") return rpcResponse(id, {});
      if (body.method === "tools/call" && body.params?.name === "mf_status") {
        return rpcResponse(id, toolContent({ ok: true }));
      }
      if (body.method === "tools/call" && body.params?.name === "mf_list_backends") {
        return rpcResponse(
          id,
          toolContent({
            backends: [
              { slug: "deepwiki", title: "DeepWiki", enabled: true, transport: "streamable-http" },
            ],
          }),
        );
      }
      return rpcResponse(id, null);
    });

    const res = await app.request("/api/v1/mcp-flow/backends");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].slug).toBe("deepwiki");
    expect(JSON.stringify(body)).not.toMatch(/mf_super_secret|apiKey/);

    const status = await app.request("/api/v1/mcp-flow/status");
    expect(status.status).toBe(200);
    const statusBody = await status.json();
    expect(JSON.stringify(statusBody)).not.toContain("mf_super_secret");
    expect(statusBody.credential?.apiKey).toBeUndefined();
  });

  it("DELETE disconnects", async () => {
    const res = await app.request("/api/v1/mcp-flow/connection", { method: "DELETE" });
    expect(res.status).toBe(200);
    const get = await app.request("/api/v1/mcp-flow/connection");
    expect((await get.json()).connected).toBe(false);
  });
});

describe("mcp-flow connection API auth", () => {
  it("returns 401 without a user", async () => {
    const prev = process.env.AUTH_DISABLED;
    delete process.env.AUTH_DISABLED;
    try {
      const app = new Hono<AppEnv>();
      app.use("*", authMiddleware);
      mcpFlowRoute(app);
      const res = await app.request("/api/v1/mcp-flow/connection");
      expect(res.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.AUTH_DISABLED;
      else process.env.AUTH_DISABLED = prev;
    }
  });
});
