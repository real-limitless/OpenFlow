import { prisma } from "./db";
import type { CredentialData } from "../lib/engine/credentials";
import { bestSharePermission } from "./services/shares";
import { loadCredentialSecret } from "./secrets";

async function decryptCredentialRow(credential: {
  dataEncrypted: string;
  secretProviderId?: string | null;
  externalRef?: string | null;
}): Promise<CredentialData | null> {
  const data = await loadCredentialSecret(credential);
  return data as CredentialData | null;
}

/**
 * Resolve a node credential reference to decrypted secret data.
 * Prefer lookup by id (unique). Scope by projectId and/or userId when provided.
 * Also allows credentials shared with the actor (permission use+).
 */
export async function resolveCredential(
  ref: {
    id?: string | null;
    name: string;
  },
  options?: { userId?: string; projectId?: string },
): Promise<CredentialData | null> {
  const userId = options?.userId;
  const projectId = options?.projectId;

  if (ref.id) {
    const credential = await prisma.credential.findUnique({ where: { id: ref.id } });
    if (!credential) return null;

    const allowed = async (): Promise<boolean> => {
      if (projectId && credential.projectId === projectId) return true;
      if (!projectId && userId && credential.userId === userId) return true;
      if (userId) {
        const share = await bestSharePermission("credential", credential.id, userId);
        if (share === "use" || share === "view" || share === "edit") return true;
      }
      if (projectId) {
        const members = await prisma.projectMember.findMany({
          where: { projectId },
          select: { userId: true },
        });
        for (const m of members) {
          const share = await bestSharePermission("credential", credential.id, m.userId);
          if (share) return true;
        }
        const projectShare = await prisma.share.findFirst({
          where: {
            resourceType: "credential",
            resourceId: credential.id,
            granteeProjectId: projectId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        });
        if (projectShare) return true;
      }
      return false;
    };

    if (!(await allowed())) return null;
    return decryptCredentialRow(credential);
  }

  if (!ref.name) return null;

  if (projectId) {
    const credential = await prisma.credential.findFirst({
      where: { name: ref.name, projectId },
    });
    if (credential) {
      return decryptCredentialRow(credential);
    }
  }

  if (userId) {
    const byUser = await prisma.credential.findFirst({
      where: { name: ref.name, userId },
    });
    if (byUser) {
      return decryptCredentialRow(byUser);
    }
    const shares = await prisma.share.findMany({
      where: {
        resourceType: "credential",
        OR: [
          { granteeUserId: userId },
          {
            granteeProjectId: {
              in: (
                await prisma.projectMember.findMany({
                  where: { userId },
                  select: { projectId: true },
                })
              ).map((m) => m.projectId),
            },
          },
        ],
      },
      select: { resourceId: true },
    });
    if (shares.length > 0) {
      const credential = await prisma.credential.findFirst({
        where: {
          id: { in: shares.map((s) => s.resourceId) },
          name: ref.name,
        },
      });
      if (credential) {
        return decryptCredentialRow(credential);
      }
    }
  }

  return null;
}

/** Bind a fixed owner for execution contexts (legacy / personal). */
export function credentialResolverForUser(userId: string) {
  return (ref: { id?: string | null; name: string }) => resolveCredential(ref, { userId });
}

/** Resolve credentials within a project (preferred for executions). */
export function credentialResolverForProject(projectId: string, userId?: string) {
  return (ref: { id?: string | null; name: string }) =>
    resolveCredential(ref, { projectId, userId });
}
