import { prisma } from "../db";
import {
  normalizeFolder,
  tagNames,
} from "../../lib/workflow/organization";

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function tagsFromExtra(extra: string | null): string[] {
  return tagNames(parseJsonObject(extra).tags);
}

export function folderFromMeta(meta: string | null): string {
  return normalizeFolder(parseJsonObject(meta).folder);
}

export async function applyWorkflowOrganization(
  workflowId: string,
  patch: { tags?: unknown; folder?: unknown; addTags?: unknown },
): Promise<{ tags: string[]; folder: string }> {
  const row = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { extra: true, meta: true },
  });
  if (!row) throw new Error("Not found");
  const extra = parseJsonObject(row.extra);
  const meta = parseJsonObject(row.meta);
  let tags = tagNames(extra.tags);
  if (patch.tags !== undefined) tags = tagNames(patch.tags);
  if (patch.addTags !== undefined) tags = tagNames([...tags, ...tagNames(patch.addTags)]);
  extra.tags = tags;
  if (patch.folder !== undefined) {
    const folder = normalizeFolder(patch.folder);
    if (folder) meta.folder = folder;
    else delete meta.folder;
  }
  await prisma.workflow.update({
    where: { id: workflowId },
    data: {
      extra: JSON.stringify(extra),
      meta: JSON.stringify(meta),
    },
  });
  return { tags, folder: normalizeFolder(meta.folder) };
}
