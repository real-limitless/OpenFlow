import { prisma } from "../db";

export const DEFAULT_ENVIRONMENTS: Array<{
  name: string;
  slug: string;
  isDefault: boolean;
  sortOrder: number;
}> = [
  { name: "Development", slug: "development", isDefault: false, sortOrder: 0 },
  { name: "Staging", slug: "staging", isDefault: false, sortOrder: 1 },
  { name: "Production", slug: "production", isDefault: true, sortOrder: 2 },
];

const SLUG_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export function isValidEnvSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Ensure a project has the standard dev/staging/prod environments. */
export async function ensureProjectEnvironments(projectId: string): Promise<void> {
  const existing = await prisma.environment.findMany({
    where: { projectId },
    select: { slug: true },
  });
  const have = new Set(existing.map((e) => e.slug));
  for (const def of DEFAULT_ENVIRONMENTS) {
    if (have.has(def.slug)) continue;
    await prisma.environment.create({
      data: {
        projectId,
        name: def.name,
        slug: def.slug,
        isDefault: def.isDefault,
        sortOrder: def.sortOrder,
      },
    });
  }
}

export async function getDefaultEnvironment(projectId: string) {
  await ensureProjectEnvironments(projectId);
  const def = await prisma.environment.findFirst({
    where: { projectId, isDefault: true },
  });
  if (def) return def;
  return prisma.environment.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  });
}

/** Resolve environment by id or slug within a project. */
export async function resolveEnvironment(
  projectId: string,
  idOrSlug?: string | null,
) {
  await ensureProjectEnvironments(projectId);
  if (!idOrSlug) {
    return getDefaultEnvironment(projectId);
  }
  const byId = await prisma.environment.findFirst({
    where: { projectId, id: idOrSlug },
  });
  if (byId) return byId;
  return prisma.environment.findFirst({
    where: { projectId, slug: idOrSlug },
  });
}

export function environmentIdFromRequest(c: {
  req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined };
}): string | undefined {
  const header = c.req.header("X-OpenFlow-Environment")?.trim();
  if (header) return header;
  const q = c.req.query("environmentId")?.trim() || c.req.query("env")?.trim();
  return q || undefined;
}
