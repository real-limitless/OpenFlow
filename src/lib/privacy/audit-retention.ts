/** App role never deletes audit rows younger than this. Default retention is off. */
export const MIN_AUDIT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 0 means the application does not prune audit logs.
 * A configured value below 90 days is raised to 90.
 */
export function auditRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OPENFLOW_AUDIT_RETENTION_DAYS;
  if (raw == null || String(raw).trim() === "" || String(raw).trim() === "0") return 0;
  const lowered = String(raw).trim().toLowerCase();
  if (lowered === "off" || lowered === "false") return 0;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(MIN_AUDIT_RETENTION_DAYS, n);
}

export function auditPruneCutoff(now: Date, retentionDays: number): Date | null {
  if (retentionDays <= 0) return null;
  const days = Math.max(MIN_AUDIT_RETENTION_DAYS, retentionDays);
  return new Date(now.getTime() - days * DAY_MS);
}

export function auditRowsEligibleForPrune<T extends { at: Date }>(
  rows: T[],
  now: Date,
  retentionDays: number,
): T[] {
  const cutoff = auditPruneCutoff(now, retentionDays);
  if (!cutoff) return [];
  return rows.filter((row) => row.at.getTime() < cutoff.getTime());
}
