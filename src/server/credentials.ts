import { decrypt } from "./crypto";
import { prisma } from "./db";
import type { CredentialData } from "../lib/engine/credentials";

export async function resolveCredential(ref: {
  id?: string | null;
  name: string;
}): Promise<CredentialData | null> {
  const credential = await prisma.credential.findFirst({
    where: ref.id ? { id: ref.id } : { name: ref.name },
  });
  if (!credential) return null;
  return JSON.parse(decrypt(credential.dataEncrypted));
}