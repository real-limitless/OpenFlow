import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const DEFAULT_TZ = "America/New_York";

type Unit = "year" | "month" | "week" | "day" | "hour" | "minute" | "second" | "millisecond";

const UNIT_PLURAL: Record<Unit, string> = {
  year: "years",
  month: "months",
  week: "weeks",
  day: "days",
  hour: "hours",
  minute: "minutes",
  second: "seconds",
  millisecond: "milliseconds",
};

function normalizeUnit(u: string): Unit | undefined {
  const map: Record<string, Unit> = {
    years: "year",
    year: "year",
    quarters: "month",
    quarter: "month",
    months: "month",
    month: "month",
    weeks: "week",
    week: "week",
    days: "day",
    day: "day",
    hours: "hour",
    hour: "hour",
    minutes: "minute",
    minute: "minute",
    seconds: "second",
    second: "second",
    milliseconds: "millisecond",
    millisecond: "millisecond",
  };
  return map[u];
}

function pad(n: number, len = 2): string {
  return String(Math.abs(n)).padStart(len, "0");
}

/**
 * Minimal Luxon-compatible token formatter (case-sensitive).
 * Supports the tokens referenced by the spec presets plus common extras.
 */
const TOKEN_RE =
  /yyyy|yy|y|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|SSS|SS|S|a|Z|ZZZ|X|x|\[([^\]]*)\]|''|'(?:[^']*)'/g;

function formatToken(date: Date, token: string, useTzParts: TzParts | null): string {
  // Literal escapes
  if (token.startsWith("[")) return token.slice(1, -1);
  if (token.startsWith("'")) return token === "''" ? "'" : token.slice(1, -1);

  const p = useTzParts;
  const Y = p ? p.year : date.getUTCFullYear();
  const M = p ? p.month : date.getUTCMonth() + 1;
  const D = p ? p.day : date.getUTCDate();
  const H24 = p ? p.hour : date.getUTCHours();
  const MI = p ? p.minute : date.getUTCMinutes();
  const S = p ? p.second : date.getUTCSeconds();
  const MS = p ? p.millisecond : date.getUTCMilliseconds();

  switch (token) {
    case "yyyy":
      return String(Y).padStart(4, "0");
    case "yy":
      return pad(Y % 100);
    case "y":
      return String(Y);
    case "MMMM": {
      const names = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      return names[M - 1] ?? String(M);
    }
    case "MMM": {
      const names = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return names[M - 1] ?? String(M);
    }
    case "MM":
      return pad(M);
    case "M":
      return String(M);
    case "dd":
      return pad(D);
    case "d":
      return String(D);
    case "HH":
      return pad(H24);
    case "H":
      return String(H24);
    case "hh": {
      const h12 = H24 % 12 === 0 ? 12 : H24 % 12;
      return pad(h12);
    }
    case "h": {
      const h12 = H24 % 12 === 0 ? 12 : H24 % 12;
      return String(h12);
    }
    case "mm":
      return pad(MI);
    case "m":
      return String(MI);
    case "ss":
      return pad(S);
    case "s":
      return String(S);
    case "SSS":
      return String(MS).padStart(3, "0");
    case "SS":
      return String(Math.floor(MS / 10)).padStart(2, "0");
    case "S":
      return String(Math.floor(MS / 100));
    case "a":
      return H24 < 12 ? "AM" : "PM";
    case "X":
      return String(Math.floor(date.getTime() / 1000));
    case "x":
      return String(date.getTime());
    case "Z":
    case "ZZZ": {
      const off = p ? p.offsetMin : 0;
      const sign = off < 0 ? "-" : "+";
      const abs = Math.abs(off);
      return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    }
    default:
      return token;
  }
}

function formatLuxon(date: Date, format: string, useTzParts: TzParts | null = null): string {
  return format.replace(TOKEN_RE, (token) => formatToken(date, token, useTzParts));
}

interface TzParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  offsetMin: number;
}

function getTzParts(date: Date, timeZone: string): TzParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "0";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  // offset = wallclock(in tz) - UTC, in minutes
  const wallUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMin = Math.round((wallUtcMs - date.getTime()) / 60000);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond: date.getUTCMilliseconds(),
    offsetMin,
  };
}

function resolveTimezone(opts: Record<string, unknown>): string {
  const tz = opts.timezone;
  if (typeof tz === "string" && tz.trim() !== "") {
    return tz.trim() === "GMT" ? "UTC" : tz.trim();
  }
  // TODO: workflow timezone lookup; fall back to instance default.
  return DEFAULT_TZ;
}

function resolveDateValue(
  raw: unknown,
  itemJson: Record<string, unknown>,
  fromFormat?: string,
): Date {
  if (raw instanceof Date) return new Date(raw.getTime());
  if (typeof raw === "number") return new Date(raw);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return new Date();
    if (s.startsWith("{{") || s.startsWith("=")) {
      const r = evaluateExpression(s, { json: itemJson });
      if (r.ok && r.value != null) {
        if (r.value instanceof Date) return new Date(r.value.getTime());
        return new Date(typeof r.value === "number" ? r.value : String(r.value));
      }
    }
    if (fromFormat) {
      const parsed = parseFromFormat(s, fromFormat);
      if (parsed) return parsed;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Could not parse date "${s}"`);
    }
    return d;
  }
  return new Date();
}

/** Minimal Luxon fromFormat: builds a regex from numeric/letter tokens. */
function parseFromFormat(input: string, format: string): Date | null {
  let re = "^";
  const marks: Array<{ token: string }> = [];
  let i = 0;
  while (i < format.length) {
    if (format[i] === "[") {
      const end = format.indexOf("]", i);
      if (end === -1) return null;
      re += format.slice(i + 1, end).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i = end + 1;
      continue;
    }
    let matched: string | null = null;
    for (const t of [
      "yyyy",
      "yy",
      "MMMM",
      "MMM",
      "MM",
      "M",
      "dd",
      "d",
      "HH",
      "H",
      "mm",
      "m",
      "ss",
      "s",
    ]) {
      if (format.startsWith(t, i)) {
        matched = t;
        break;
      }
    }
    if (matched) {
      marks.push({ token: matched });
      if (matched === "MMMM") re += "(\\S+)";
      else if (matched === "MMM") re += "(\\S+)";
      else if (matched === "yyyy") re += "(\\d{4})";
      else if (matched === "yy") re += "(\\d{2})";
      else re += "(\\d{1,2})";
      i += matched.length;
    } else {
      re += format[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  re += "$";
  const m = new RegExp(re).exec(input);
  if (!m) return null;
  let year = 1970;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthAbbr = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  for (let k = 0; k < marks.length; k++) {
    const val = m[k + 1];
    const tok = marks[k].token;
    switch (tok) {
      case "yyyy":
        year = Number(val);
        break;
      case "yy":
        year = 2000 + Number(val);
        break;
      case "MM":
      case "M":
        month = Number(val);
        break;
      case "MMMM":
        month = monthNames.findIndex((n) => n.toLowerCase() === val.toLowerCase()) + 1;
        break;
      case "MMM":
        month = monthAbbr.findIndex((n) => n.toLowerCase() === val.toLowerCase()) + 1;
        break;
      case "dd":
      case "d":
        day = Number(val);
        break;
      case "HH":
      case "H":
        hour = Number(val);
        break;
      case "mm":
      case "m":
        minute = Number(val);
        break;
      case "ss":
      case "s":
        second = Number(val);
        break;
    }
  }
  if (month < 1) return null;
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addDuration(date: Date, amount: number, unit: Unit): Date {
  const d = new Date(date.getTime());
  switch (unit) {
    case "year":
      d.setUTCFullYear(d.getUTCFullYear() + amount);
      break;
    case "month":
      d.setUTCMonth(d.getUTCMonth() + amount);
      break;
    case "week":
      d.setUTCDate(d.getUTCDate() + amount * 7);
      break;
    case "day":
      d.setUTCDate(d.getUTCDate() + amount);
      break;
    case "hour":
      d.setUTCHours(d.getUTCHours() + amount);
      break;
    case "minute":
      d.setUTCMinutes(d.getUTCMinutes() + amount);
      break;
    case "second":
      d.setUTCSeconds(d.getUTCSeconds() + amount);
      break;
    case "millisecond":
      d.setUTCMilliseconds(d.getUTCMilliseconds() + amount);
      break;
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
      const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      return Math.ceil((tmp.getTime() - yearStart.getTime()) / 86400000 / 7) + 1;
    }
    default:
      return date.getUTCDate();
  }
}

function startOf(date: Date, unit: Unit): Date {
  const d = new Date(date.getTime());
  switch (unit) {
    case "year":
      return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    case "month":
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    case "week": {
      const dayNum = d.getUTCDay() || 7;
      const monday = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (dayNum - 1)),
      );
      return monday;
    }
    case "day":
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    case "hour":
      return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()),
      );
    case "minute":
      return new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          d.getUTCHours(),
          d.getUTCMinutes(),
        ),
      );
    case "second":
      return new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          d.getUTCHours(),
          d.getUTCMinutes(),
          d.getUTCSeconds(),
        ),
      );
    default:
      return d;
  }
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/** Cascade diff: full years, then months, then weeks, then days, then h/m/s/ms. */
function diffDecomposed(start: Date, end: Date, units: Unit[]): Record<string, number> {
  let neg = false;
  let s = new Date(start.getTime());
  let e = new Date(end.getTime());
  if (e.getTime() < s.getTime()) {
    neg = true;
    [s, e] = [e, s];
  }
  const out: Record<string, number> = {};
  const ordered: Unit[] = [
    "year",
    "month",
    "week",
    "day",
    "hour",
    "minute",
    "second",
    "millisecond",
  ];
  for (const u of ordered) {
    if (!units.includes(u)) continue;
    if (u === "year") {
      let years = e.getUTCFullYear() - s.getUTCFullYear();
      const shifted = addDuration(s, years, "year");
      if (shifted.getTime() > e.getTime()) years -= 1;
      out[UNIT_PLURAL.year] = years;
      s = addDuration(s, years, "year");
    } else if (u === "month") {
      let months =
        (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
      const shifted = addDuration(s, months, "month");
      if (shifted.getTime() > e.getTime()) months -= 1;
      out[UNIT_PLURAL.month] = months;
      s = addDuration(s, months, "month");
    } else if (u === "week") {
      const weeks = Math.floor((e.getTime() - s.getTime()) / (7 * 86400000));
      out[UNIT_PLURAL.week] = weeks;
      s = addDuration(s, weeks, "week");
    } else if (u === "day") {
      const days = Math.floor((e.getTime() - s.getTime()) / 86400000);
      out[UNIT_PLURAL.day] = days;
      s = addDuration(s, days, "day");
    } else if (u === "hour") {
      const hours = Math.floor((e.getTime() - s.getTime()) / 3600000);
      out[UNIT_PLURAL.hour] = hours;
      s = addDuration(s, hours, "hour");
    } else if (u === "minute") {
      const minutes = Math.floor((e.getTime() - s.getTime()) / 60000);
      out[UNIT_PLURAL.minute] = minutes;
      s = addDuration(s, minutes, "minute");
    } else if (u === "second") {
      const seconds = Math.floor((e.getTime() - s.getTime()) / 1000);
      out[UNIT_PLURAL.second] = seconds;
      s = addDuration(s, seconds, "second");
    } else if (u === "millisecond") {
      out[UNIT_PLURAL.millisecond] = e.getTime() - s.getTime();
    }
  }
  if (neg) {
    for (const k of Object.keys(out)) out[k] = -out[k];
  }
  return out;
}

function toIsoDuration(diff: Record<string, number>): string {
  const order = ["years", "months", "weeks", "days", "hours", "minutes", "seconds"];
  const map: Record<string, string> = {
    years: "Y",
    months: "M",
    weeks: "W",
    days: "D",
    hours: "H",
    minutes: "M",
    seconds: "S",
  };
  let datePart = "";
  let timePart = "";
  for (const k of order) {
    if (!(k in diff) || diff[k] === 0) continue;
    const v = diff[k];
    if (k === "hours" || k === "minutes" || k === "seconds") {
      timePart += `${v}${map[k]}`;
    } else {
      datePart += `${v}${map[k]}`;
    }
  }
  // Milliseconds render as decimal seconds (spec).
  if ("milliseconds" in diff && diff.milliseconds !== 0) {
    timePart += `${(diff.milliseconds / 1000).toFixed(3).replace(/\.?0+$/, "")}S`;
  }
  let result = "P";
  if (datePart) result += datePart;
  if (timePart) result += `T${timePart}`;
  return result === "P" ? "PT0S" : result;
}

const OP_DEFAULT_OUTPUT: Record<string, string> = {
  addToDate: "newDate",
  subtractFromDate: "newDate",
  formatDate: "formattedDate",
  getCurrentDate: "currentDate",
  extractDate: "datePart",
  getTimeBetweenDates: "timeDifference",
  roundDate: "roundedDate",
};

const FORMAT_PRESETS: Record<string, string> = {
  "MM/dd/yyyy": "MM/dd/yyyy",
  "yyyy/MM/dd": "yyyy/MM/dd",
  "MMMM dd yyyy": "MMMM dd yyyy",
  "MM-dd-yyyy": "MM-dd-yyyy",
  "yyyy-MM-dd": "yyyy-MM-dd",
  X: "X",
  x: "x",
};

export const dateTimeExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] = inputItems.length > 0 ? inputItems : [{ json: {} }];

  const operation = ctx.getParam<string>("operation", "");
  if (!operation) {
    throw new Error("Date & Time node requires the `operation` parameter");
  }

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const includeInputFields = options.includeInputFields === true;
  const outputField =
    ctx.getParam<string>("outputFieldName", "") || OP_DEFAULT_OUTPUT[operation] || "result";

  const mapItem = (item: INodeExecutionData, value: unknown): INodeExecutionData => {
    if (includeInputFields) {
      return { json: { ...item.json, [outputField]: value }, pairedItem: item.pairedItem };
    }
    return { json: { [outputField]: value }, pairedItem: item.pairedItem };
  };

  const failItem = (item: INodeExecutionData, idx: number, err: unknown): INodeExecutionData => {
    return {
      json: {
        ...(includeInputFields ? item.json : {}),
        [outputField]: null,
        error: err instanceof Error ? err.message : String(err),
      },
      pairedItem: item.pairedItem ?? { item: idx, input: 0 },
    };
  };

  const out: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    try {
      if (operation === "getCurrentDate") {
        const includeTime = ctx.getParam<boolean>("includeTime", true);
        const tz = resolveTimezone(options);
        const now = new Date();
        let value: string;
        if (includeTime) {
          value = now.toISOString();
        } else {
          const parts = getTzParts(now, tz);
          // Midnight in target tz, expressed as a UTC instant.
          const midnightUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
          value = new Date(midnightUtc - parts.offsetMin * 60000).toISOString();
        }
        out.push(mapItem(item, value));
        continue;
      }

      if (operation === "formatDate") {
        const formatKey = ctx.getParam<string>("format", "MM/dd/yyyy");
        const customFormat = ctx.getParam<string>("customFormat", "");
        const fromFormat =
          typeof options.fromFormat === "string" && options.fromFormat !== ""
            ? options.fromFormat
            : undefined;
        const useWorkflowTz = options.timezone === true;
        const dateRaw = ctx.getParam("date", "");
        const date = resolveDateValue(dateRaw, item.json, fromFormat);
        if (formatKey === "X") {
          out.push(mapItem(item, Math.floor(date.getTime() / 1000)));
          continue;
        }
        if (formatKey === "x") {
          out.push(mapItem(item, date.getTime()));
          continue;
        }
        const fmt =
          formatKey === "custom"
            ? customFormat || "MM/dd/yyyy"
            : (FORMAT_PRESETS[formatKey] ?? formatKey);
        const tzParts = useWorkflowTz ? getTzParts(date, resolveTimezone(options)) : null;
        out.push(mapItem(item, formatLuxon(date, fmt, tzParts)));
        continue;
      }

      if (operation === "addToDate" || operation === "subtractFromDate") {
        const magnitude = ctx.getParam<string>("magnitude", "");
        const timeUnitRaw = ctx.getParam<string>("timeUnit", "days");
        const durationRaw = ctx.getParam<number>("duration", 0);
        const unit = normalizeUnit(timeUnitRaw) ?? "day";
        if (!magnitude) {
          throw new Error(`\`magnitude\` is required for ${operation}`);
        }
        let duration = Number(durationRaw) || 0;
        if (operation === "subtractFromDate") duration = -Math.abs(duration);
        const date = resolveDateValue(magnitude, item.json);
        const next = addDuration(date, duration, unit);
        out.push(mapItem(item, next.toISOString()));
        continue;
      }

      if (operation === "extractDate") {
        const dateRaw = ctx.getParam("date", "");
        const part = ctx.getParam<string>("part", "month");
        const date = resolveDateValue(dateRaw, item.json);
        out.push(mapItem(item, extractPart(date, part)));
        continue;
      }

      if (operation === "getTimeBetweenDates") {
        const startRaw = ctx.getParam("startDate", "");
        const endRaw = ctx.getParam("endDate", "");
        const unitsRaw = ctx.getParam<string[]>("units", ["day"]);
        const units = (Array.isArray(unitsRaw) ? unitsRaw : [unitsRaw])
          .map((u) => normalizeUnit(String(u)))
          .filter((u): u is Unit => u !== undefined);
        const start = resolveDateValue(startRaw, item.json);
        const end = resolveDateValue(endRaw, item.json);
        const diff = diffDecomposed(start, end, units);
        if (options.isoString === true) {
          out.push(mapItem(item, toIsoDuration(diff)));
        } else {
          out.push(mapItem(item, diff));
        }
        continue;
      }

      if (operation === "roundDate") {
        const dateRaw = ctx.getParam("date", "");
        const mode = ctx.getParam<string>("mode", "roundDown");
        const date = resolveDateValue(dateRaw, item.json);
        let rounded: Date;
        if (mode === "roundUp") {
          // roundUp only supports "End of Month" in the descriptor.
          rounded = endOfMonth(date);
        } else {
          const toNearest = normalizeUnit(ctx.getParam<string>("toNearest", "month")) ?? "month";
          rounded = startOf(date, toNearest);
        }
        out.push(mapItem(item, rounded.toISOString()));
        continue;
      }

      throw new Error(`Unknown operation "${operation}"`);
    } catch (err) {
      if (ctx.continueOnFail()) {
        out.push(failItem(item, idx, err));
      } else {
        throw err;
      }
    }
  }

  return [out];
};
