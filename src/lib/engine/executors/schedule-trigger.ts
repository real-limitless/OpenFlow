import type { NodeExecutor } from "@/sdk";

interface ScheduleRule {
  field: string;
  secondsInterval?: number;
  minutesInterval?: number;
  hoursInterval?: number;
  daysInterval?: number;
  weeksInterval?: number;
  monthsInterval?: number;
  triggerAtMinute?: number;
  triggerAtHour?: number;
  triggerAtDay?: number[];
  triggerAtDayOfMonth?: number;
  expression?: string;
}

const CRON_FIELD_RANGES: Record<string, [number, number]> = {
  second: [0, 59],
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 7],
};

function validateCronField(value: string, [min, max]: [number, number]): boolean {
  for (const part of value.split(",")) {
    let base = part;
    let step = 1;
    const stepMatch = part.match(/^(.+?)\/(\d+)$/);
    if (stepMatch) {
      base = stepMatch[1];
      step = parseInt(stepMatch[2], 10);
      if (step < 1) return false;
    }
    if (base === "*") continue;
    const rangeMatch = base.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const lo = parseInt(rangeMatch[1], 10);
      const hi = parseInt(rangeMatch[2], 10);
      if (lo < min || lo > max || hi < min || hi > max || lo > hi) return false;
      continue;
    }
    if (/^\d+$/.test(base)) {
      const n = parseInt(base, 10);
      if (n < min || n > max) return false;
      continue;
    }
    return false;
  }
  return true;
}

function validateCronExpression(expr: string): void {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    throw new Error("Invalid cron expression");
  }
  const fields =
    parts.length === 6
      ? ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek"]
      : ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];
  for (let i = 0; i < parts.length; i++) {
    if (!validateCronField(parts[i], CRON_FIELD_RANGES[fields[i]])) {
      throw new Error("Invalid cron expression");
    }
  }
}

function readRules(ctx: {
  getParam: <T = unknown>(name: string, defaultValue?: T) => T;
}): ScheduleRule[] {
  const rule = ctx.getParam<Record<string, unknown>>("rule", {});
  const interval = Array.isArray((rule as Record<string, unknown>)?.interval)
    ? ((rule as Record<string, unknown>).interval as ScheduleRule[])
    : [];
  if (interval.length === 0) return [{ field: "days" }];
  return interval;
}

function effectiveTimezone(ctx: {
  getWorkflow: () => { settings?: { timezone?: string } } | undefined;
}): string {
  const tz = ctx.getWorkflow()?.settings?.timezone;
  if (tz) return tz;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) return resolved;
  } catch {
    // fall through
  }
  return "UTC";
}

function buildTimestampItem(timezone: string) {
  const now = new Date();
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    json: {
      timestamp: now.toISOString(),
      "Readable date": `${get("month")} ${get("day")}, ${get("year")}`,
      "Readable time": `${get("hour")}:${get("minute")}:${get("second")}`,
      "Day of week": get("weekday"),
      Year: get("year"),
      Month: get("month"),
      "Day of month": Number(get("day")) || 0,
      Hour: Number(get("hour")) || 0,
      Minute: Number(get("minute")) || 0,
      Second: Number(get("second")) || 0,
      Timezone: timezone,
    },
  };
}

/**
 * Schedule Trigger — emits one timestamp item when the engine starts from this
 * node (manual test run or a scheduler tick). Actual cron/interval registration
 * lives in the host (server scheduler); this executor is the per-fire item emit.
 *
 * Multi-rule handling: the host registers each `rule.interval[]` entry as an
 * independent schedule. On a manual/test invoke the executor emits a single
 * combined timestamp item (host-side per-rule execution starts are out of scope
 * here). Cron expressions are validated on every invoke so invalid cron is
 * surfaced at first schedule build / publish.
 */
export const scheduleTriggerExecutor: NodeExecutor = async (ctx) => {
  const rules = readRules(ctx);
  for (const rule of rules) {
    if (rule.field === "cronExpression") {
      validateCronExpression(rule.expression ?? "");
    }
  }
  const timezone = effectiveTimezone(ctx);
  return [[buildTimestampItem(timezone)]];
};
