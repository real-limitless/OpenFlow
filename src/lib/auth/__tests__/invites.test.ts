import { describe, expect, it } from "vitest";
import { isApiPath } from "../../../server/api-prefixes";
import {
  canChangeUserRole,
  consumeInviteRecord,
  createInviteToken,
  hashInviteToken,
  normalizeInviteRole,
  publicInvite,
  type InviteRecord,
} from "../invites";

function sample(overrides: Partial<InviteRecord> = {}): InviteRecord {
  return {
    id: "inv_test",
    email: "a@example.com",
    role: "member",
    tokenHash: hashInviteToken("tok"),
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdBy: "owner1",
    usedAt: null,
    usedByEmail: null,
    ...overrides,
  };
}

describe("invite tokens", () => {
  it("hashes and consumes a matching invite once", () => {
    const token = createInviteToken();
    const rec = sample({ tokenHash: hashInviteToken(token), email: "join@example.com" });
    const first = consumeInviteRecord([rec], token, "join@example.com", Date.parse("2026-06-01"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.role).toBe("member");
    const second = consumeInviteRecord(first.invites, token, "join@example.com", Date.parse("2026-06-02"));
    expect(second.ok).toBe(false);
  });

  it("rejects expired, wrong email, and empty tokens", () => {
    const token = createInviteToken();
    const rec = sample({
      tokenHash: hashInviteToken(token),
      email: "only@example.com",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    expect(consumeInviteRecord([rec], token, "only@example.com", Date.parse("2026-01-01")).ok).toBe(
      false,
    );
    const live = sample({ tokenHash: hashInviteToken(token), email: "only@example.com" });
    expect(consumeInviteRecord([live], token, "other@example.com").ok).toBe(false);
    expect(consumeInviteRecord([live], "", "only@example.com").ok).toBe(false);
  });

  it("allows open invites and reports pending vs used", () => {
    const token = createInviteToken();
    const rec = sample({ tokenHash: hashInviteToken(token), email: null, role: "admin" });
    expect(publicInvite(rec).pending).toBe(true);
    const used = consumeInviteRecord([rec], token, "anyone@example.com");
    expect(used.ok).toBe(true);
    if (!used.ok) return;
    expect(used.role).toBe("admin");
    expect(publicInvite(used.invites[0]!).pending).toBe(false);
  });
});

describe("role changes", () => {
  it("blocks demoting the last owner", () => {
    expect(
      canChangeUserRole({
        actorRole: "owner",
        targetRole: "owner",
        nextRole: "member",
        ownerCount: 1,
      }).ok,
    ).toBe(false);
    expect(
      canChangeUserRole({
        actorRole: "owner",
        targetRole: "owner",
        nextRole: "admin",
        ownerCount: 2,
      }).ok,
    ).toBe(true);
  });

  it("blocks admins from minting owners", () => {
    expect(
      canChangeUserRole({
        actorRole: "admin",
        targetRole: "member",
        nextRole: "owner",
        ownerCount: 1,
      }).ok,
    ).toBe(false);
    expect(normalizeInviteRole("admin")).toBe("admin");
    expect(normalizeInviteRole("nope")).toBe("member");
  });
});

describe("invite register URL vs OAuth DCR", () => {
  it("sends GET /register to the SPA and POST /register to Hono", () => {
    expect(isApiPath("/register", "GET")).toBe(false);
    expect(isApiPath("/register", "POST")).toBe(true);
  });
});
