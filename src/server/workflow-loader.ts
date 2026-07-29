import { prisma } from "./db";
import type { IWorkflow } from "../lib/workflow/types";

export function definitionFromRow(row: {
  id: string;
  name: string;
  active: boolean;
  nodes: string;
  connections: string;
  settings: string | null;
  staticData: string | null;
  pinData: string | null;
  meta: string | null;
  versionId: string;
}): IWorkflow {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    nodes: JSON.parse(row.nodes),
    connections: JSON.parse(row.connections),
    settings: row.settings ? JSON.parse(row.settings) : undefined,
    staticData: row.staticData ? JSON.parse(row.staticData) : undefined,
    pinData: row.pinData ? JSON.parse(row.pinData) : undefined,
    meta: row.meta ? JSON.parse(row.meta) : undefined,
    versionId: row.versionId,
  } as unknown as IWorkflow;
}

/**
 * Load a workflow by primary id, or fall back to unique name match.
 * Used by Execute Workflow node for nested runs.
 */
export async function resolveSubWorkflowFromDb(
  idOrName: string,
): Promise<IWorkflow | null> {
  const key = idOrName.trim();
  if (!key) return null;

  const byId = await prisma.workflow.findUnique({ where: { id: key } });
  if (byId) return definitionFromRow(byId);

  const byName = await prisma.workflow.findMany({
    where: { name: key },
    take: 2,
  });
  if (byName.length === 1) return definitionFromRow(byName[0]);
  if (byName.length > 1) {
    throw new Error(
      `Multiple workflows named "${key}"; use the workflow id instead`,
    );
  }

  return null;
}

/** Debug helper: list id+name for error messages. */
export async function listWorkflowSummaries(limit = 25): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.workflow.findMany({
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows;
}
