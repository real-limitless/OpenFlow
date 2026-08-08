import { prisma } from "../db";
import {
  listAccessibleProjectIds,
  requireProjectPermission,
  type ProjectRole,
} from "./projects";
import {
  listSharedResourceIds,
  requireResourceAccess,
  type SharePermission,
} from "./shares";

function minShareForRole(minRole: ProjectRole): SharePermission {
  return minRole === "viewer" ? "view" : "edit";
}

export async function loadWorkflowIfAllowed(
  id: string,
  userId: string,
  minRole: ProjectRole,
) {
  const row = await prisma.workflow.findUnique({ where: { id } });
  if (!row) return { status: 404 as const, error: "Not found" as const };
  const access = await requireResourceAccess(
    "workflow",
    id,
    userId,
    minShareForRole(minRole),
    row.projectId,
  );
  if (!access.ok) {
    return { status: 404 as const, error: "Not found" as const };
  }
  return { row, access };
}

export async function assertWorkflowAccess(
  workflowId: string,
  userId: string,
  minRole: ProjectRole,
): Promise<void> {
  const result = await loadWorkflowIfAllowed(workflowId, userId, minRole);
  if ("error" in result) {
    throw new Error(`Workflow not found or access denied: ${workflowId}`);
  }
}

export async function editorListWorkflows(
  userId: string,
  opts?: { limit?: number; offset?: number; projectId?: string },
) {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 40));
  const offset = Math.max(0, opts?.offset ?? 0);

  let projectIds: string[];
  if (opts?.projectId) {
    const access = await requireProjectPermission(opts.projectId, userId, "viewer");
    if (!access.ok) throw new Error(access.error);
    projectIds = [opts.projectId];
  } else {
    projectIds = await listAccessibleProjectIds(userId, "viewer");
  }

  const sharedIds = opts?.projectId
    ? []
    : await listSharedResourceIds("workflow", userId, "view");

  const where = {
    OR: [
      { projectId: { in: projectIds } },
      ...(sharedIds.length > 0 ? [{ id: { in: sharedIds } }] : []),
    ],
  };

  const [total, rows] = await Promise.all([
    prisma.workflow.count({ where }),
    prisma.workflow.findMany({
      where,
      select: {
        id: true,
        name: true,
        active: true,
        nodes: true,
        projectId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  const sharedSet = new Set(sharedIds);
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    active: r.active,
    projectId: r.projectId,
    shared: sharedSet.has(r.id) && !projectIds.includes(r.projectId),
    nodeCount: (JSON.parse(r.nodes) as unknown[]).length,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return {
    total,
    count: items.length,
    offset,
    limit,
    has_more: offset + items.length < total,
    next_offset: offset + items.length < total ? offset + items.length : null,
    items,
  };
}

export async function editorCreateWorkflow(
  userId: string,
  args: { name?: string; projectId?: string },
) {
  const { ensureUserWithProject } = await import("./users");
  const { projectId: personalId } = await ensureUserWithProject(userId);
  const projectId = args.projectId || personalId;
  const access = await requireProjectPermission(projectId, userId, "editor");
  if (!access.ok) throw new Error(access.error);

  const name = (args.name ?? "New Workflow").trim() || "New Workflow";
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const row = await prisma.workflow.create({
    data: {
      id,
      userId,
      projectId,
      name,
      active: false,
      versionId,
      nodes: "[]",
      connections: "{}",
    },
  });
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    projectId: row.projectId,
    nodeCount: 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function editorActivateWorkflow(
  workflowId: string,
  userId: string,
  active: boolean,
) {
  const result = await loadWorkflowIfAllowed(workflowId, userId, "editor");
  if ("error" in result) throw new Error(`Workflow not found: ${workflowId}`);
  const row = await prisma.workflow.update({
    where: { id: workflowId },
    data: { active },
  });
  return { id: row.id, name: row.name, active: row.active };
}

export async function editorListExecutions(
  workflowId: string,
  userId: string,
  opts?: { limit?: number },
) {
  await assertWorkflowAccess(workflowId, userId, "viewer");
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 10));
  const rows = await prisma.execution.findMany({
    where: { workflowId },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      mode: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    mode: r.mode,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}
