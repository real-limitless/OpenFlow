import { prisma } from "../db";
import { buildAuditEvent, type AuditAction } from "../../lib/audit/events";

export function requestIp(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const xf = c.req.header("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || null;
  return c.req.header("x-real-ip") ?? null;
}

export async function recordAudit(opts: {
  actorId: string;
  action: AuditAction | string;
  resource: string;
  resourceId?: string;
  detail?: unknown;
  ip?: string | null;
}): Promise<void> {
  const ev = buildAuditEvent(opts.action, opts.resource, opts.resourceId, opts.detail);
  try {
    const actor = await prisma.user.findUnique({
      where: { id: opts.actorId },
      select: { email: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId,
        actorEmail: actor?.email ?? "",
        action: ev.action,
        resource: ev.resource,
        resourceId: ev.resourceId,
        detail: JSON.stringify(ev.detail),
        ip: opts.ip ?? null,
      },
    });
  } catch {
    /* audit must never fail the primary action */
  }
}

export async function listAuditLogs(limit = 100) {
  const take = Math.min(Math.max(limit, 1), 500);
  const rows = await prisma.auditLog.findMany({
    orderBy: { at: "desc" },
    take,
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    detail: safeJson(row.detail),
    ip: row.ip,
  }));
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
