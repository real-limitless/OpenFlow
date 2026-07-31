import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";

export const SESSION_MAX_AGE_SEC = 86400; // 24 hours

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);

  await prisma.session.create({
    data: { tokenHash, userId, expiresAt },
  });

  return token;
}

export async function getSessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true, id: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.userId;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

/** Best-effort cleanup of expired sessions (call periodically if desired). */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return result.count;
}
