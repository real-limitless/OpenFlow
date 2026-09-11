export type RetentionPolicy = {
  /** Delete finished executions older than this many days. 0 = do not prune by age. */
  retentionDays: number;
  /** Keep at most this many finished executions per workflow (newest first). 0 = unlimited. */
  maxExecutionsPerWorkflow: number;
  /** Mask credential-shaped keys and tokens in persisted runData. */
  redactRunData: boolean;
  /** Also mask email-shaped strings in runData. */
  redactPii: boolean;
  /** When true, waiting/running rows can be deleted by age/count. Default false. */
  pruneActive: boolean;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  retentionDays: 30,
  maxExecutionsPerWorkflow: 500,
  redactRunData: true,
  redactPii: false,
  pruneActive: false,
};

export type ExecutionPruneRow = {
  id: string;
  workflowId: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
};

const ACTIVE = new Set(["running", "waiting"]);

export function parseRetentionPolicy(raw: unknown, env: NodeJS.ProcessEnv = process.env): RetentionPolicy {
  const base: RetentionPolicy = { ...DEFAULT_RETENTION_POLICY };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.retentionDays === "number" && Number.isFinite(o.retentionDays)) {
      base.retentionDays = Math.max(0, Math.floor(o.retentionDays));
    }
    if (typeof o.maxExecutionsPerWorkflow === "number" && Number.isFinite(o.maxExecutionsPerWorkflow)) {
      base.maxExecutionsPerWorkflow = Math.max(0, Math.floor(o.maxExecutionsPerWorkflow));
    }
    if (typeof o.redactRunData === "boolean") base.redactRunData = o.redactRunData;
    if (typeof o.redactPii === "boolean") base.redactPii = o.redactPii;
    if (typeof o.pruneActive === "boolean") base.pruneActive = o.pruneActive;
  }
  const days = parseInt(env.OPENFLOW_RETENTION_DAYS ?? "", 10);
  if (Number.isFinite(days) && env.OPENFLOW_RETENTION_DAYS) {
    base.retentionDays = Math.max(0, days);
  }
  const max = parseInt(env.OPENFLOW_MAX_EXECUTIONS_PER_WORKFLOW ?? "", 10);
  if (Number.isFinite(max) && env.OPENFLOW_MAX_EXECUTIONS_PER_WORKFLOW) {
    base.maxExecutionsPerWorkflow = Math.max(0, max);
  }
  if (env.OPENFLOW_REDACT_RUN_DATA === "false" || env.OPENFLOW_REDACT_RUN_DATA === "0") {
    base.redactRunData = false;
  } else if (env.OPENFLOW_REDACT_RUN_DATA === "true" || env.OPENFLOW_REDACT_RUN_DATA === "1") {
    base.redactRunData = true;
  }
  return base;
}

export function pickPruneIds(
  rows: ExecutionPruneRow[],
  policy: RetentionPolicy,
  now = new Date(),
): string[] {
  const drop = new Set<string>();
  const cutoff =
    policy.retentionDays > 0
      ? new Date(now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000)
      : null;

  const eligible = (row: ExecutionPruneRow) =>
    policy.pruneActive || !ACTIVE.has(row.status);

  if (cutoff) {
    for (const row of rows) {
      if (!eligible(row)) continue;
      const stamp = row.finishedAt ?? row.startedAt;
      if (stamp < cutoff) drop.add(row.id);
    }
  }

  if (policy.maxExecutionsPerWorkflow > 0) {
    const byWf = new Map<string, ExecutionPruneRow[]>();
    for (const row of rows) {
      if (drop.has(row.id)) continue;
      if (!eligible(row)) continue;
      const list = byWf.get(row.workflowId) ?? [];
      list.push(row);
      byWf.set(row.workflowId, list);
    }
    for (const list of byWf.values()) {
      list.sort((a, b) => {
        const ta = (a.finishedAt ?? a.startedAt).getTime();
        const tb = (b.finishedAt ?? b.startedAt).getTime();
        return tb - ta;
      });
      for (const extra of list.slice(policy.maxExecutionsPerWorkflow)) {
        drop.add(extra.id);
      }
    }
  }

  return [...drop];
}
