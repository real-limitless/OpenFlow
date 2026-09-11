import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const INVITE_ROLES = ["admin", "member"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const USER_ROLES = ["owner", "admin", "member", "disabled"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type InviteRecord = {
  id: string;
  email: string | null;
  role: InviteRole;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  usedAt: string | null;
  usedByEmail: string | null;
};

export type PublicInvite = {
  id: string;
  email: string | null;
  role: InviteRole;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByEmail: string | null;
  expired: boolean;
  pending: boolean;
};

export function createInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function newInviteId(): string {
  return `inv_${randomBytes(8).toString("hex")}`;
}

export function normalizeInviteRole(role: unknown): InviteRole {
  return role === "admin" ? "admin" : "member";
}

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && (USER_ROLES as readonly string[]).includes(role);
}

export function publicInvite(inv: InviteRecord, now = Date.now()): PublicInvite {
  const expired = new Date(inv.expiresAt).getTime() <= now;
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
    usedAt: inv.usedAt,
    usedByEmail: inv.usedByEmail,
    expired,
    pending: !inv.usedAt && !expired,
  };
}

function hashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function consumeInviteRecord(
  invites: InviteRecord[],
  token: string,
  email: string,
  now = Date.now(),
):
  | { ok: true; invites: InviteRecord[]; role: InviteRole; inviteId: string }
  | { ok: false; error: string } {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Invite token required" };
  const hash = hashInviteToken(trimmed);
  const idx = invites.findIndex((i) => hashEquals(i.tokenHash, hash));
  if (idx < 0) return { ok: false, error: "Invalid invite" };
  const inv = invites[idx]!;
  if (inv.usedAt) return { ok: false, error: "Invite already used" };
  if (new Date(inv.expiresAt).getTime() <= now) return { ok: false, error: "Invite expired" };
  const want = email.trim().toLowerCase();
  if (inv.email && inv.email.toLowerCase() !== want) {
    return { ok: false, error: "Invite is for a different email" };
  }
  const next = invites.slice();
  next[idx] = {
    ...inv,
    usedAt: new Date(now).toISOString(),
    usedByEmail: want,
  };
  return { ok: true, invites: next, role: inv.role, inviteId: inv.id };
}

export function canChangeUserRole(opts: {
  actorRole: string;
  targetRole: string;
  nextRole: string;
  ownerCount: number;
}): { ok: true } | { ok: false; error: string } {
  if (!isUserRole(opts.nextRole)) return { ok: false, error: "Invalid role" };
  if (opts.actorRole !== "owner" && opts.actorRole !== "admin") {
    return { ok: false, error: "Only instance admins can change roles" };
  }
  if (opts.actorRole !== "owner" && (opts.targetRole === "owner" || opts.nextRole === "owner")) {
    return { ok: false, error: "Only an owner can change owner roles" };
  }
  if (opts.targetRole === "owner" && opts.nextRole !== "owner" && opts.ownerCount <= 1) {
    return { ok: false, error: "Cannot demote the last owner" };
  }
  return { ok: true };
}
