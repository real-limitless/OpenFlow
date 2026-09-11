import { prisma } from "../db";
import {
  consumeInviteRecord,
  newInviteId,
  type InviteRecord,
  type InviteRole,
  type PublicInvite,
  publicInvite,
} from "../../lib/auth/invites";

export const INVITES_KEY = "auth.invites";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function loadInvites(): Promise<InviteRecord[]> {
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: INVITES_KEY } });
    if (!row?.value) return [];
    const parsed = JSON.parse(row.value) as InviteRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveInvites(invites: InviteRecord[]): Promise<void> {
  await prisma.instanceSetting.upsert({
    where: { key: INVITES_KEY },
    create: { key: INVITES_KEY, value: JSON.stringify(invites) },
    update: { value: JSON.stringify(invites) },
  });
}

export async function listInvites(now = Date.now()): Promise<PublicInvite[]> {
  const invites = await loadInvites();
  return invites
    .map((inv) => publicInvite(inv, now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createInvite(opts: {
  email?: string | null;
  role: InviteRole;
  tokenHash: string;
  createdBy: string;
  ttlMs?: number;
  now?: number;
}): Promise<InviteRecord> {
  const now = opts.now ?? Date.now();
  const email = opts.email?.trim().toLowerCase() || null;
  const rec: InviteRecord = {
    id: newInviteId(),
    email,
    role: opts.role,
    tokenHash: opts.tokenHash,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (opts.ttlMs ?? DEFAULT_TTL_MS)).toISOString(),
    createdBy: opts.createdBy,
    usedAt: null,
    usedByEmail: null,
  };
  const invites = await loadInvites();
  invites.push(rec);
  await saveInvites(invites);
  return rec;
}

export async function revokeInvite(id: string): Promise<boolean> {
  const invites = await loadInvites();
  const next = invites.filter((inv) => inv.id !== id);
  if (next.length === invites.length) return false;
  await saveInvites(next);
  return true;
}

export async function consumeInviteToken(
  token: string,
  email: string,
  now = Date.now(),
): Promise<{ ok: true; role: InviteRole } | { ok: false; error: string }> {
  const invites = await loadInvites();
  const result = consumeInviteRecord(invites, token, email, now);
  if (!result.ok) return result;
  await saveInvites(result.invites);
  return { ok: true, role: result.role };
}
