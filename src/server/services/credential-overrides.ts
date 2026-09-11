import { prisma } from "../db";
import { encrypt } from "../crypto";
import { loadCredentialSecret } from "../secrets";
import type { SecretPayload } from "../secrets";

export async function loadCredentialOverride(
  credentialId: string,
  environmentId: string | undefined,
): Promise<SecretPayload | null> {
  if (!environmentId) return null;
  const row = await prisma.credentialEnvOverride.findUnique({
    where: {
      credentialId_environmentId: { credentialId, environmentId },
    },
  });
  if (!row?.dataEncrypted) return null;
  return loadCredentialSecret({ dataEncrypted: row.dataEncrypted, secretProviderId: null, externalRef: null });
}

export async function upsertCredentialOverride(
  credentialId: string,
  environmentId: string,
  data: Record<string, unknown>,
) {
  const dataEncrypted = encrypt(JSON.stringify(data));
  return prisma.credentialEnvOverride.upsert({
    where: { credentialId_environmentId: { credentialId, environmentId } },
    create: { credentialId, environmentId, dataEncrypted },
    update: { dataEncrypted },
  });
}

export async function listCredentialOverrides(credentialId: string) {
  const rows = await prisma.credentialEnvOverride.findMany({
    where: { credentialId },
    select: { environmentId: true, updatedAt: true },
  });
  return rows.map((r) => ({
    environmentId: r.environmentId,
    updatedAt: r.updatedAt.toISOString(),
    hasOverride: true,
  }));
}

export async function deleteCredentialOverride(credentialId: string, environmentId: string) {
  await prisma.credentialEnvOverride.deleteMany({ where: { credentialId, environmentId } });
}
