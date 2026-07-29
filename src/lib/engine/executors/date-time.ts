import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function formatToken(date: Date, token: string): string {
  switch (token) {
    case "YYYY":
      return String(date.getUTCFullYear());
    case "YY":
      return String(date.getUTCFullYear()).slice(-2).padStart(2, "0");
    case "MM":
      return String(date.getUTCMonth() + 1).padStart(2, "0");
    case "M":
      return String(date.getUTCMonth() + 1);
    case "DD":
      return String(date.getUTCDate()).padStart(2, "0");
    case "D":
      return String(date.getUTCDate());
    case "HH":
      return String(date.getUTCHours()).padStart(2, "0");
    case "H":
      return String(date.getUTCHours());
    case "mm":
      return String(date.getUTCMinutes()).padStart(2, "0");
    case "ss":
      return String(date.getUTCSeconds()).padStart(2, "0");
    case "SSS":
      return String(date.getUTCMilliseconds()).padStart(3, "0");
    default:
      return token;
  }
}

function formatDate(date: Date, format: string): string {
  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss|SSS|M|D|H/g, (token) =>
    formatToken(date, token),
  );
}

function resolveDateValue(
  raw: unknown,
  itemJson: Record<string, unknown>,
): Date {
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") return new Date(raw);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("{{") || s.startsWith("=")) {
      const r = evaluateExpression(s, { json: itemJson });
      if (r.ok && r.value != null) return new Date(String(r.value));
    }
    if (s === "") return new Date();
    return new Date(s);
  }
  return new Date();
}

function addDuration(date: Date, amount: number, unit: string): Date {
  const d = new Date(date.getTime());
  const n = amount;
  switch (unit) {
    case "years":
    case "year":
      d.setUTCFullYear(d.getUTCFullYear() + n);
      break;
    case "months":
    case "month":
      d.setUTCMonth(d.getUTCMonth() + n);
      break;
    case "weeks":
    case "week":
      d.setUTCDate(d.getUTCDate() + n * 7);
      break;
    case "days":
    case "day":
      d.setUTCDate(d.getUTCDate() + n);
      break;
    case "hours":
    case "hour":
      d.setUTCHours(d.getUTCHours() + n);
      break;
    case "minutes":
    case "minute":
      d.setUTCMinutes(d.getUTCMinutes() + n);
      break;
    case "seconds":
    case "second":
      d.setUTCSeconds(d.getUTCSeconds() + n);
      break;
    case "milliseconds":
    case "millisecond":
      d.setUTCMilliseconds(d.getUTCMilliseconds() + n);
      break;
    default:
      d.setUTCMilliseconds(d.getUTCMilliseconds() + n);
  }
  return d;
}

function extractPart(date: Date, part: string): number {
  switch (part) {
    case "year":
      return date.getUTCFullYear();
    case "month":
      return date.getUTCMonth() + 1;
    case "day":
      return date.getUTCDate();
    case "hour":
      return date.getUTCHours();
    case "minute":
      return date.getUTCMinutes();
    case "second":
      return date.getUTCSeconds();
    case "week": {
      const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const diff = date.getTime() - start.getTime();
      return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
    }
    default:
      return date.getUTCDate();
  }
}

export const dateTimeExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items = inputItems.length > 0 ? inputItems : [{ json: {} }];

  // Support both modern `operation` and legacy `mode`
  const operation =
    ctx.getParam<string>("operation", "") ||
    ctx.getParam<string>("mode", "formatDate");

  const includeInputFields =
    ctx.getParam<boolean>("includeInputFields", true) !== false &&
    (ctx.getParam<Record<string, unknown>>("options", {})?.includeInputFields !==
      false);

  const outputField =
    ctx.getParam<string>("outputFieldName", "") ||
    ctx.getParam<string>("outputField", "result") ||
    "result";

  const mapItem = (item: INodeExecutionData, value: unknown): INodeExecutionData => {
    if (includeInputFields) {
      return { json: { ...item.json, [outputField]: value }, pairedItem: item.pairedItem };
    }
    return { json: { [outputField]: value }, pairedItem: item.pairedItem };
  };

  // Legacy mode aliases
  const op =
    operation === "format"
      ? "formatDate"
      : operation === "calculate"
        ? "addToDate"
        : operation;

  if (op === "getCurrentDate") {
    const includeTime = ctx.getParam<boolean>("includeCurrentTime", true) !== false;
    const now = new Date();
    if (!includeTime) {
      now.setUTCHours(0, 0, 0, 0);
    }
    return [items.map((item) => mapItem(item, now.toISOString()))];
  }

  if (op === "formatDate") {
    const format =
      ctx.getParam<string>("format", "YYYY-MM-DD HH:mm:ss") ||
      (ctx.getParam<Record<string, unknown>>("options", {})?.outputFormat as string) ||
      "YYYY-MM-DD HH:mm:ss";
    const dateRaw = ctx.getParam("date", "");
    return [
      items.map((item) => {
        const date = resolveDateValue(dateRaw === "" ? Date.now() : dateRaw, item.json);
        return mapItem(item, formatDate(date, format));
      }),
    ];
  }

  if (op === "addToDate" || op === "subtractFromDate") {
    const dateRaw =
      ctx.getParam("date") ??
      ctx.getParam("dateToAddTo") ??
      ctx.getParam("dateToSubtractFrom") ??
      "";
    const unit =
      ctx.getParam<string>("timeUnit", "days") ||
      ctx.getParam<string>("timeUnitToAdd", "days") ||
      ctx.getParam<string>("timeUnitToSubtract", "days") ||
      "days";
    let duration = Number(ctx.getParam("duration", 0)) || 0;
    if (op === "subtractFromDate") duration = -Math.abs(duration);
    if (op === "addToDate" && ctx.getParam("operation") === undefined && operation === "calculate") {
      // legacy calculate left passthrough — treat as add 0
    }
    return [
      items.map((item) => {
        const date = resolveDateValue(dateRaw === "" ? Date.now() : dateRaw, item.json);
        const next = addDuration(date, duration, unit);
        return mapItem(item, next.toISOString());
      }),
    ];
  }

  if (op === "extractDate") {
    const dateRaw = ctx.getParam("date", "");
    const part = ctx.getParam<string>("part", "day");
    return [
      items.map((item) => {
        const date = resolveDateValue(dateRaw === "" ? Date.now() : dateRaw, item.json);
        return mapItem(item, extractPart(date, part));
      }),
    ];
  }

  if (op === "getTimeBetweenDates") {
    const startRaw = ctx.getParam("startDate", "");
    const endRaw = ctx.getParam("endDate", "");
    const unit = ctx.getParam<string>("unit", "days");
    return [
      items.map((item) => {
        const start = resolveDateValue(startRaw, item.json);
        const end = resolveDateValue(endRaw, item.json);
        const ms = end.getTime() - start.getTime();
        const div: Record<string, number> = {
          milliseconds: 1,
          seconds: 1000,
          minutes: 60_000,
          hours: 3_600_000,
          days: 86_400_000,
          weeks: 604_800_000,
        };
        const value = ms / (div[unit] ?? 86_400_000);
        return mapItem(item, value);
      }),
    ];
  }

  // default: format
  const format = ctx.getParam<string>("format", "YYYY-MM-DD HH:mm:ss");
  const dateRaw = ctx.getParam("date", "");
  return [
    items.map((item) => {
      const date = resolveDateValue(dateRaw === "" ? Date.now() : dateRaw, item.json);
      return mapItem(item, formatDate(date, format));
    }),
  ];
};
