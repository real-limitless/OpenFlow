import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  csrfProtectsRequest,
  csrfTokensMatch,
  generateCsrfToken,
  parseCsrfCookie,
  signCsrfCookie,
} from "../csrf";
import { csrfMiddleware } from "../../../server/middleware/csrf";
import type { AppEnv } from "../../../server/middleware/auth";

describe("csrfProtectsRequest", () => {
  it("skips try-out, reads, and bearer auth", () => {
    expect(
      csrfProtectsRequest({
        method: "PUT",
        path: "/api/v1/workflows/1",
        authKind: "session",
        authDisabled: true,
      }),
    ).toBe(false);
    expect(
      csrfProtectsRequest({
        method: "GET",
        path: "/api/v1/workflows",
        authKind: "session",
        authDisabled: false,
      }),
    ).toBe(false);
    expect(
      csrfProtectsRequest({
        method: "DELETE",
        path: "/api/v1/workflows/1",
        authKind: "api_key",
        authDisabled: false,
      }),
    ).toBe(false);
  });

  it("protects cookie-session writes", () => {
    expect(
      csrfProtectsRequest({
        method: "PUT",
        path: "/api/v1/settings/webhooks",
        authKind: "session",
        authDisabled: false,
      }),
    ).toBe(true);
  });
});

describe("signed csrf cookie", () => {
  it("round-trips", () => {
    const token = generateCsrfToken();
    const raw = signCsrfCookie(token, "secret");
    expect(parseCsrfCookie(raw, "secret")).toBe(token);
    expect(parseCsrfCookie(raw, "other")).toBeUndefined();
  });

  it("compares header to cookie token", () => {
    const t = "abc";
    expect(csrfTokensMatch(t, t)).toBe(true);
    expect(csrfTokensMatch(t, "zzz")).toBe(false);
  });
});

describe("csrfMiddleware", () => {
  it("rejects session mutations without a token", async () => {
    const prev = process.env.AUTH_DISABLED;
    process.env.AUTH_DISABLED = "false";
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("authKind", "session");
      c.set("userId", "u1");
      await next();
    });
    app.use("*", csrfMiddleware);
    app.put("/api/v1/ping", (c) => c.json({ ok: true }));

    const denied = await app.request("http://localhost/api/v1/ping", { method: "PUT" });
    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { code?: string };
    expect(body.code).toBe("csrf");

    if (prev === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prev;
  });

  it("allows a matching cookie and header", async () => {
    const prev = process.env.AUTH_DISABLED;
    process.env.AUTH_DISABLED = "false";
    const { issueCsrfCookie } = await import("../../../server/middleware/csrf");
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("authKind", "session");
      c.set("userId", "u1");
      await next();
    });
    app.use("*", csrfMiddleware);
    app.get("/api/v1/token", (c) => c.json({ csrfToken: issueCsrfCookie(c) }));
    app.put("/api/v1/ping", (c) => c.json({ ok: true }));

    const minted = await app.request("http://localhost/api/v1/token");
    const { csrfToken } = (await minted.json()) as { csrfToken: string };
    const cookie = minted.headers.get("set-cookie") ?? "";
    const ok = await app.request("http://localhost/api/v1/ping", {
      method: "PUT",
      headers: { Cookie: cookie.split(";")[0]!, "X-CSRF-Token": csrfToken },
    });
    expect(ok.status).toBe(200);

    if (prev === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = prev;
  });
});
