import { prisma } from "../db";
import type { IWorkflow } from "../../lib/workflow/types";
import { diffWorkflows } from "../../lib/workflow/versions";

const KEEP = 50;

export async function snapshotWorkflowVersion(opts: {
  workflowId: string;
  workflow: IWorkflow;
  createdBy: string;
}): Promise<void> {
  try {
    await prisma.workflowVersion.create({
      data: {
        workflowId: opts.workflowId,
        versionId: opts.workflow.versionId ?? crypto.randomUUID(),
        name: opts.workflow.name,
        snapshot: JSON.stringify(opts.workflow),
        createdBy: opts.createdBy,
      },
    });
    const extra = await prisma.workflowVersion.findMany({
      where: { workflowId: opts.workflowId },
      orderBy: { createdAt: "desc" },
      skip: KEEP,
      select: { id: true },
    });
    if (extra.length > 0) {
      await prisma.workflowVersion.deleteMany({ where: { id: { in: extra.map((r) => r.id) } } });
    }
  } catch {
    /* versioning must not fail saves */
  }
}

export async function listWorkflowVersions(workflowId: string) {
  const rows = await prisma.workflowVersion.findMany({
    where: { workflowId },
    orderBy: { createdAt: "desc" },
    select: { id: true, versionId: true, name: true, createdAt: true, createdBy: true },
  });
  return rows.map((r) => ({
    id: r.id,
    versionId: r.versionId,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
  }));
}

export async function getWorkflowVersionSnapshot(id: string): Promise<IWorkflow | null> {
  const row = await prisma.workflowVersion.findUnique({ where: { id } });
  if (!row) return null;
  try {
    return JSON.parse(row.snapshot) as IWorkflow;
  } catch {
    return null;
  }
}

export async function diffWorkflowVersions(fromId: string, toId: string) {
  const from = await getWorkflowVersionSnapshot(fromId);
  const to = await getWorkflowVersionSnapshot(toId);
  if (!from || !to) return null;
  return diffWorkflows(from, to);
}
