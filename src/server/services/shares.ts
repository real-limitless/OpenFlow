import { prisma } from "../db";
import { listAccessibleProjectIds, requireProjectPermission } from "./projects";

export type ShareResourceType = "workflow" | "credential";
export type SharePermission = "use" | "view" | "edit";

const PERM_RANK: Record<SharePermission, number> = {
  use: 1,
  view: 2,
  edit: 3,
};

export function isSharePermission(v: string): v is SharePermission {
  return v in PERM_RANK;
}

export function isShareResourceType(v: string): v is ShareResourceType {
  return v === "workflow" || v === "credential";
}

export function permAtLeast(have: SharePermission, min: SharePermission): boolean {
  return PERM_RANK[have] >= PERM_RANK[min];
}

function notExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() > Date.now();
}

/** Active shares that grant `userId` access to a resource (direct user or via project). */
export async function findSharesForUser(
  resourceType: ShareResourceType,
  resourceId: string,
  userId: string,
): Promise<Array<{ id: string; permission: SharePermission }>> {
  const projectIds = await listAccessibleProjectIds(userId, "viewer");
  const rows = await prisma.share.findMany({
    where: {
      resourceType,
      resourceId,
      OR: [
        { granteeUserId: userId },
        ...(projectIds.length > 0 ? [{ granteeProjectId: { in: projectIds } }] : []),
      ],
    },
    select: { id: true, permission: true, expiresAt: true },
  });
  return rows
    .filter((r) => notExpired(r.expiresAt) && isSharePermission(r.permission))
    .map((r) => ({ id: r.id, permission: r.permission as SharePermission }));
}

export async function bestSharePermission(
  resourceType: ShareResourceType,
  resourceId: string,
  userId: string,
): Promise<SharePermission | null> {
  const shares = await findSharesForUser(resourceType, resourceId, userId);
  if (shares.length === 0) return null;
  return shares.reduce<SharePermission>(
    (best, s) => (PERM_RANK[s.permission] > PERM_RANK[best] ? s.permission : best),
    "use",
  );
}

export type ResourceAccess =
  | { ok: true; via: "project" | "share"; permission: SharePermission | "owner" | "admin" | "editor" | "viewer" }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Workflow/credential access: project membership OR share.
 * minShare maps project roles: viewer→view, editor→edit, etc.
 * For credentials runtime, use minShare "use".
 */
export async function requireResourceAccess(
  resourceType: ShareResourceType,
  resourceId: string,
  userId: string,
  minShare: SharePermission,
  projectId: string | null,
): Promise<ResourceAccess> {
  if (projectId) {
    const minProject =
      minShare === "edit" ? "editor" : minShare === "view" ? "viewer" : "viewer";
    // "use" only needs viewer on project if resource is in project
    const projectMin = minShare === "use" ? "viewer" : minProject;
    const access = await requireProjectPermission(projectId, userId, projectMin);
    if (access.ok) {
      // editor+ for edit; viewer ok for view/use
      if (minShare === "edit" && access.role === "viewer") {
        // fall through to share check
      } else {
        return { ok: true, via: "project", permission: access.role };
      }
    }
  }

  const sharePerm = await bestSharePermission(resourceType, resourceId, userId);
  if (sharePerm && permAtLeast(sharePerm, minShare)) {
    return { ok: true, via: "share", permission: sharePerm };
  }

  if (!projectId) return { ok: false, status: 404, error: "Not found" };
  return { ok: false, status: 404, error: "Not found" };
}

/** Resource IDs shared with user at least `min` permission. */
export async function listSharedResourceIds(
  resourceType: ShareResourceType,
  userId: string,
  min: SharePermission = "view",
): Promise<string[]> {
  const projectIds = await listAccessibleProjectIds(userId, "viewer");
  const rows = await prisma.share.findMany({
    where: {
      resourceType,
      OR: [
        { granteeUserId: userId },
        ...(projectIds.length > 0 ? [{ granteeProjectId: { in: projectIds } }] : []),
      ],
    },
    select: { resourceId: true, permission: true, expiresAt: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    if (!notExpired(r.expiresAt) || !isSharePermission(r.permission)) continue;
    if (permAtLeast(r.permission, min)) ids.add(r.resourceId);
  }
  return [...ids];
}

/** Can the actor manage shares on this resource? (project admin+ or resource creator path via project editor+) */
export async function canManageShares(
  resourceType: ShareResourceType,
  resourceId: string,
  userId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; status: 403 | 404; error: string }> {
  if (resourceType === "workflow") {
    const wf = await prisma.workflow.findUnique({
      where: { id: resourceId },
      select: { projectId: true },
    });
    if (!wf) return { ok: false, status: 404, error: "Not found" };
    const access = await requireProjectPermission(wf.projectId, userId, "editor");
    if (!access.ok) return { ok: false, status: 403, error: "Insufficient permission to share" };
    return { ok: true, projectId: wf.projectId };
  }

  const cred = await prisma.credential.findUnique({
    where: { id: resourceId },
    select: { projectId: true },
  });
  if (!cred) return { ok: false, status: 404, error: "Not found" };
  const access = await requireProjectPermission(cred.projectId, userId, "editor");
  if (!access.ok) return { ok: false, status: 403, error: "Insufficient permission to share" };
  return { ok: true, projectId: cred.projectId };
}

/** Credential IDs the user may resolve at runtime (project membership or use+ share). */
export async function listResolvableCredentialIds(userId: string, projectId?: string): Promise<string[]> {
  const ids = new Set<string>();

  if (projectId) {
    const inProject = await prisma.credential.findMany({
      where: { projectId },
      select: { id: true },
    });
    for (const c of inProject) ids.add(c.id);
  }

  const shared = await listSharedResourceIds("credential", userId, "use");
  for (const id of shared) ids.add(id);

  return [...ids];
}
