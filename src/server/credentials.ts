import { decrypt } from "./crypto";
import { prisma } from "./db";
import type { CredentialData } from "../lib/engine/credentials";

/**
 * Resolve a node credential reference to decrypted secret data.
 * Prefer lookup by id (unique). Optional userId scopes name-only lookups.
 */
export async function resolveCredential(
  ref: {
    id?: string | null;
    name: string;
  },
  options?: { userId?: string },
): Promise<CredentialData | null> {
  const userId = options?.userId;

  if (ref.id) {
    const credential = await prisma.credential.findFirst({
      where: userId ? { id: ref.id, userId } : { id: ref.id },
    });
    if (!credential) return null;
    return JSON.parse(decrypt(credential.dataEncrypted)) as CredentialData;
  }

  if (!ref.name) return null;

  const credential = await prisma.credential.findFirst({
    where: userId ? { name: ref.name, userId } : { name: ref.name },
  });
  if (!credential) return null;
  return JSON.parse(decrypt(credential.dataEncrypted)) as CredentialData;
}

/** Bind a fixed owner for execution contexts. */
export function credentialResolverForUser(userId: string) {
  return (ref: { id?: string | null; name: string }) =>
    resolveCredential(ref, { userId });
}
