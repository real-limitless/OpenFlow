import { prisma } from "../db";

export type ProjectRole = "owner" | "admin" | "editor" | "viewer";

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export function isProjectRole(value: string): value is ProjectRole {
  return value in ROLE_RANK;
}

export function roleAtLeast(role: ProjectRole, min: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function ensurePersonalProject(userId: string): Promise<string> {
  const existing = await prisma.projectMember.findFirst({
    where: { userId, project: { type: "personal" } },
    select: { projectId: true },
  });
  if (existing) {
    const { ensureProjectEnvironments } = await import("./environments");
    await ensureProjectEnvironments(existing.projectId);
    return existing.projectId;
  }

  const project = await prisma.project.create({
    data: {
      name: "Personal",
      type: "personal",
      members: {
        create: { userId, role: "owner" },
      },
    },
    select: { id: true },
  });
  const { ensureProjectEnvironments } = await import("./environments");
  await ensureProjectEnvironments(project.id);
  return project.id;
}

export async function getMemberRole(
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> {
  const row = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (!row || !isProjectRole(row.role)) return null;
  return row.role;
}

export type ProjectAccess =
  | { ok: true; role: ProjectRole; projectId: string }
  | { ok: false; status: 403 | 404; error: string };

export async function requireProjectPermission(
  projectId: string,
  userId: string,
  minRole: ProjectRole,
): Promise<ProjectAccess> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { ok: false, status: 404, error: "Project not found" };

  const role = await getMemberRole(projectId, userId);
  if (!role) return { ok: false, status: 403, error: "Not a project member" };
  if (!roleAtLeast(role, minRole)) {
    return { ok: false, status: 403, error: "Insufficient project permission" };
  }
  return { ok: true, role, projectId };
}

/** Project IDs the user can access at least as `minRole`. */
export async function listAccessibleProjectIds(
  userId: string,
  minRole: ProjectRole = "viewer",
): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true, role: true },
  });
  return members
    .filter((m) => isProjectRole(m.role) && roleAtLeast(m.role, minRole))
    .map((m) => m.projectId);
}

export function projectIdFromRequest(c: {
  req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined };
}): string | undefined {
  const header = c.req.header("X-OpenFlow-Project")?.trim();
  if (header) return header;
  const q = c.req.query("projectId")?.trim();
  return q || undefined;
}
