import { prisma } from "../db";
import { redactRunData } from "../../lib/engine/redact-run-data";
import {
  DEFAULT_RETENTION_POLICY,
  parseRetentionPolicy,
  pickPruneIds,
  type RetentionPolicy,
} from "../../lib/privacy/retention";
import { log } from "../log";

export const RETENTION_KEY = "privacy.retention";

let cache: { at: number; value: RetentionPolicy } | null = null;
const CACHE_TTL_MS = 5_000;

export function invalidateRetentionCache() {
  cache = null;
}

export async function getRetentionPolicy(): Promise<RetentionPolicy> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  let stored: unknown;
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: RETENTION_KEY } });
    stored = row?.value ? JSON.parse(row.value) : null;
  } catch {
    stored = null;
  }
  const value = parseRetentionPolicy(stored);
  cache = { at: now, value };
  return value;
}

export async function setRetentionPolicy(patch: Partial<RetentionPolicy>): Promise<RetentionPolicy> {
  const current = await getRetentionPolicy();
  const next = parseRetentionPolicy({ ...current, ...patch }, {});
  await prisma.instanceSetting.upsert({
    where: { key: RETENTION_KEY },
    create: { key: RETENTION_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  cache = { at: Date.now(), value: next };
  return next;
}

export async function serializeRunData(runData: unknown): Promise<string> {
  const policy = await getRetentionPolicy();
  let parsed = runData;
  if (typeof runData === "string") {
    try {
      parsed = JSON.parse(runData);
    } catch {
      return runData;
    }
  }
  if (!policy.redactRunData && !policy.redactPii) return JSON.stringify(parsed);
  return JSON.stringify(redactRunData(parsed, { pii: policy.redactPii }));
}

export async function pruneExecutions(now = new Date()): Promise<{ deleted: number }> {
  const policy = await getRetentionPolicy();
  if (policy.retentionDays <= 0 && policy.maxExecutionsPerWorkflow <= 0) {
    return { deleted: 0 };
  }
  const rows = await prisma.execution.findMany({
    select: { id: true, workflowId: true, status: true, startedAt: true, finishedAt: true },
  });
  const ids = pickPruneIds(rows, policy, now);
  if (!ids.length) return { deleted: 0 };
  const result = await prisma.execution.deleteMany({ where: { id: { in: ids } } });
  log.info("execution retention prune", {
    component: "retention",
    deleted: result.count,
    retentionDays: policy.retentionDays,
    maxPerWorkflow: policy.maxExecutionsPerWorkflow,
  });
  return { deleted: result.count };
}

let pruneTimer: ReturnType<typeof setInterval> | null = null;

export function startRetentionPruner(): void {
  if (pruneTimer) return;
  const tick = async () => {
    try {
      const { connection } = await import("../queue");
      const locked = await connection.set("openflow:retention-prune", "1", "EX", 300, "NX");
      if (!locked) return;
      await pruneExecutions();
    } catch (err) {
      log.warn("retention prune skipped", {
        component: "retention",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
  void tick();
  pruneTimer = setInterval(() => void tick(), 60 * 60 * 1000);
}

export { DEFAULT_RETENTION_POLICY };
