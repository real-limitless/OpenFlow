import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../services/instance-admin", () => ({
  requireInstanceAdmin: vi.fn(),
}));

import healthRoute from "../routes/health";
import type { AppEnv } from "../middleware/auth";
import { requireInstanceAdmin } from "../services/instance-admin";

const gate = vi.mocked(requireInstanceAdmin);

function appFor(userId?: string) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    if (userId) c.set("userId", userId);
    await next();
  });
  healthRoute(app);
  return app;
}

describe("GET /api/v1/logs/recent", () => {
  beforeEach(() => {
    gate.mockReset();
  });

  it("requires an authenticated caller", async () => {
    const res = await appFor().request("/api/v1/logs/recent");
    expect(res.status).toBe(401);
    expect(gate).not.toHaveBeenCalled();
  });

  it("rejects a member", async () => {
    gate.mockResolvedValue({ error: "Only instance admins can change this setting", status: 403 });
    const res = await appFor("member-1").request("/api/v1/logs/recent");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Admin role required");
    expect(gate).toHaveBeenCalledWith("member-1");
  });

  it("allows an owner or admin", async () => {
    gate.mockResolvedValue(true);
    const res = await appFor("owner-1").request("/api/v1/logs/recent");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[] };
    expect(Array.isArray(body.logs)).toBe(true);
  });
});
