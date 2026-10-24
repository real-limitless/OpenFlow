import { prisma } from "../db";
import { buildAuditEvent, type AuditAction } from "../../lib/audit/events";
import { requestIp as clientRequestIp } from "../../lib/security/client-ip";
import {
  securityEventForAction,
  type SecurityEvent,
  type SecurityOutcome,
} from "../lib/security-event";
import { log } from "../log";

export function requestIp(c: {
  req: { header: (n: string) => string | undefined };
  env?: unknown;
}): string | null {
  return clientRequestIp(c);
}

export async function recordAudit(opts: {
  actorId: string;
  /** Log-line actor when it differs from the stored user id (API key prefix). */
  actor?: string | null;
  action: AuditAction | string;
  resource: string;
  resourceId?: string;
  detail?: unknown;
  ip?: string | null;
  event?: SecurityEvent;
  outcome?: SecurityOutcome;
  /** Skip the user lookup and store this email (empty for anonymous attempts). */
  actorEmail?: string;
}): Promise<void> {
  const ev = buildAuditEvent(opts.action, opts.resource, opts.resourceId, opts.detail);
  const inferred = securityEventForAction(String(opts.action));
  const event = opts.event ?? inferred.event;
  const outcome = opts.outcome ?? inferred.outcome;
  const level = outcome === "success" ? "info" : "warn";
  log[level](String(opts.action), {
    event,
    action: String(opts.action),
    outcome,
    actor: opts.actor ?? (opts.actorId && opts.actorId !== "anonymous" ? opts.actorId : null),
    client_ip: opts.ip ?? null,
    resource: ev.resource,
    resource_id: ev.resourceId,
    detail: ev.detail,
  });
  try {
    let actorEmail = opts.actorEmail;
    if (actorEmail === undefined && opts.actorId && opts.actorId !== "anonymous") {
      const actor = await prisma.user.findUnique({
        where: { id: opts.actorId },
        select: { email: true },
      });
      actorEmail = actor?.email ?? "";
    }
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId || "anonymous",
        actorEmail: actorEmail ?? "",
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
