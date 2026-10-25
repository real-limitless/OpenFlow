import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const { userCount, userCreate, userFindUnique, createSession, consumeInviteToken } = vi.hoisted(
  () => ({
    userCount: vi.fn(),
    userCreate: vi.fn(),
    userFindUnique: vi.fn(),
    createSession: vi.fn(async () => "session-token"),
    consumeInviteToken: vi.fn(async () => ({ ok: false as const, error: "Invite token required" })),
  }),
);

vi.mock("../db", () => ({
  prisma: {
    instanceSetting: { findUnique: vi.fn(async () => null) },
    user: {
      count: (...args: unknown[]) => userCount(...args),
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
    },
  },
}));

vi.mock("../services/users", () => ({
  LOCAL_USER_ID: "local",
  ensureUser: vi.fn(async () => undefined),
  ensureUserWithProject: vi.fn(async (userId: string) => ({ userId, projectId: "proj-1" })),
}));

vi.mock("../services/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/sessions")>();
  return {
    ...actual,
    createSession: (...args: unknown[]) => createSession(...args),
  };
});

vi.mock("../services/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/audit")>();
  return {
    ...actual,
    recordAudit: vi.fn(async () => undefined),
  };
});

vi.mock("../services/invites", () => ({
  consumeInviteToken: (...args: unknown[]) => consumeInviteToken(...args),
}));

import authRoute from "../routes/auth";
import type { AppEnv } from "../middleware/auth";

function app() {
  const hono = new Hono<AppEnv>();
  authRoute(hono);
  return hono;
}

function postRegister(body: Record<string, unknown>) {
  return app().request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cookieHeader(res: Response): string {
  const getter = res.headers.getSetCookie?.bind(res.headers);
  if (getter) return getter().join("\n");
  return res.headers.get("set-cookie") ?? "";
}

describe("POST /api/v1/auth/register first-owner policy", () => {
  beforeEach(() => {
    userCount.mockReset();
    userCreate.mockReset();
    userFindUnique.mockReset();
    createSession.mockClear();
    consumeInviteToken.mockReset();
    consumeInviteToken.mockResolvedValue({ ok: false, error: "Invite token required" });
    userFindUnique.mockResolvedValue(null);
    userCreate.mockImplementation(async (args: { data: { email: string; role: string } }) => ({
      id: "user-new",
      email: args.data.email,
      role: args.data.role,
    }));
    delete process.env.OPENFLOW_ALLOW_FIRST_OWNER;
    delete process.env.OPENFLOW_INVITE_ONLY;
    delete process.env.OPENFLOW_REGISTRATION_DISABLED;
    delete process.env.AUTH_DISABLED;
  });

  it("empty directory and OPENFLOW_OPEN_REGISTER=false does not create an owner", async () => {
    process.env.OPENFLOW_OPEN_REGISTER = "false";
    userCount.mockResolvedValue(0);

    const res = await postRegister({
      email: "owner@example.com",
      password: "password-owner-1",
    });

    expect(res.status).toBe(403);
    expect(res.status).not.toBe(201);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("invite_only");
    expect(userCreate).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(cookieHeader(res)).not.toMatch(/session=/);
  });

  it("empty directory and OPENFLOW_OPEN_REGISTER=true creates the first owner", async () => {
    process.env.OPENFLOW_OPEN_REGISTER = "true";
    userCount.mockResolvedValue(0);

    const res = await postRegister({
      email: "owner@example.com",
      password: "password-owner-1",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { role?: string; email?: string };
    expect(body.role).toBe("owner");
    expect(body.email).toBe("owner@example.com");
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(cookieHeader(res)).toMatch(/session=/);
  });

  it("rejects public register when an owner already exists and the flag is false", async () => {
    process.env.OPENFLOW_OPEN_REGISTER = "false";
    userCount.mockResolvedValue(1);

    const res = await postRegister({
      email: "second@example.com",
      password: "password-member-2",
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("invite_only");
    expect(userCreate).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(cookieHeader(res)).not.toMatch(/session=/);
  });

  it("creates the first owner when OPENFLOW_ALLOW_FIRST_OWNER is true", async () => {
    process.env.OPENFLOW_OPEN_REGISTER = "false";
    process.env.OPENFLOW_ALLOW_FIRST_OWNER = "true";
    userCount.mockResolvedValue(0);

    const res = await postRegister({
      email: "bootstrap@example.com",
      password: "password-owner-1",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { role?: string };
    expect(body.role).toBe("owner");
    expect(userCreate).toHaveBeenCalledTimes(1);
  });

  it("still accepts an invite token when public register is closed and no users exist", async () => {
    process.env.OPENFLOW_OPEN_REGISTER = "false";
    userCount.mockResolvedValue(0);
    consumeInviteToken.mockResolvedValue({ ok: true, role: "member" });

    const res = await postRegister({
      email: "invited@example.com",
      password: "password-owner-1",
      inviteToken: "invite-token",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { role?: string };
    expect(body.role).toBe("owner");
    expect(consumeInviteToken).toHaveBeenCalledWith("invite-token", "invited@example.com");
    expect(userCreate).toHaveBeenCalledTimes(1);
  });
});
