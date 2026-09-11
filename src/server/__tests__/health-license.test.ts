import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import healthRoute from "../routes/health";
import type { AppEnv } from "../middleware/auth";

describe("health license metadata", () => {
  it("GET /health reports version and Apache-2.0", async () => {
    const app = new Hono<AppEnv>();
    healthRoute(app);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string; license: string };
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(body.license).toBe("Apache-2.0");
  });
});
