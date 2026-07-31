export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export type LogRecord = {
  ts: string;
  level: LogLevel;
  msg: string;
  service: string;
} & LogFields;

export type LogSink = (record: LogRecord) => void | Promise<void>;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function parseLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? "info").toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return "info";
}

function parseFormat(raw: string | undefined): "json" | "pretty" {
  return raw === "pretty" ? "pretty" : "json";
}

const sinks: LogSink[] = [];
let minLevel: LogLevel = parseLevel(process.env.LOG_LEVEL);
let format: "json" | "pretty" = parseFormat(process.env.LOG_FORMAT);
const service = process.env.LOG_SERVICE ?? "openflow";

/** Recent records for optional admin/debug (ring buffer). */
const recent: LogRecord[] = [];
const RECENT_MAX = 200;

export function configureLogger(opts?: {
  level?: LogLevel;
  format?: "json" | "pretty";
  sinks?: LogSink[];
}): void {
  if (opts?.level) minLevel = opts.level;
  if (opts?.format) format = opts.format;
  if (opts?.sinks) {
    sinks.length = 0;
    sinks.push(...opts.sinks);
  }
}

export function addLogSink(sink: LogSink): void {
  sinks.push(sink);
}

export function clearLogSinks(): void {
  sinks.length = 0;
}

export function getRecentLogs(limit = 50): LogRecord[] {
  return recent.slice(-limit);
}

function writeStdout(record: LogRecord): void {
  const line =
    format === "pretty"
      ? `${record.ts} ${record.level.toUpperCase().padEnd(5)} ${record.msg}${
          Object.keys(record).length > 4
            ? " " +
              JSON.stringify(
                Object.fromEntries(
                  Object.entries(record).filter(
                    ([k]) => !["ts", "level", "msg", "service"].includes(k),
                  ),
                ),
              )
            : ""
        }`
      : JSON.stringify(record);

  if (record.level === "error") console.error(line);
  else if (record.level === "warn") console.warn(line);
  else console.log(line);
}

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;

  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    msg,
    service,
    ...fields,
  };

  recent.push(record);
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);

  writeStdout(record);

  for (const sink of sinks) {
    try {
      const r = sink(record);
      if (r && typeof (r as Promise<void>).then === "function") {
        (r as Promise<void>).catch(() => undefined);
      }
    } catch {
      /* never throw from logging */
    }
  }
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
  child(base: LogFields) {
    return {
      debug: (msg: string, fields?: LogFields) => emit("debug", msg, { ...base, ...fields }),
      info: (msg: string, fields?: LogFields) => emit("info", msg, { ...base, ...fields }),
      warn: (msg: string, fields?: LogFields) => emit("warn", msg, { ...base, ...fields }),
      error: (msg: string, fields?: LogFields) => emit("error", msg, { ...base, ...fields }),
    };
  },
};

/** HTTP sink: POST each log line as JSON body to URL. */
export function createHttpLogSink(url: string, headers?: Record<string, string>): LogSink {
  return (record) => {
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(record),
    }).catch(() => undefined);
  };
}

/**
 * Datadog Logs HTTP intake.
 * https://docs.datadoghq.com/api/latest/logs/
 */
export function createDatadogLogSink(opts: {
  apiKey: string;
  site?: string;
  service?: string;
  source?: string;
}): LogSink {
  const site = opts.site ?? process.env.DD_SITE ?? "datadoghq.com";
  const url = `https://http-intake.logs.${site}/api/v2/logs`;
  return (record) => {
    const payload = [
      {
        ddsource: opts.source ?? "openflow",
        service: opts.service ?? record.service,
        message: record.msg,
        status: record.level,
        timestamp: record.ts,
        ...record,
      },
    ];
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": opts.apiKey,
      },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  };
}

/** Wire sinks from environment (call once at process boot). */
export function initLogStreaming(): void {
  minLevel = parseLevel(process.env.LOG_LEVEL);
  format = parseFormat(process.env.LOG_FORMAT);

  const type = (process.env.LOG_STREAM_TYPE ?? "none").trim().toLowerCase();
  if (type === "none" || type === "") return;

  if (type === "http") {
    const url = process.env.LOG_STREAM_URL?.trim();
    if (!url) {
      console.warn("[openflow] LOG_STREAM_TYPE=http requires LOG_STREAM_URL");
      return;
    }
    addLogSink(createHttpLogSink(url));
    log.info("log streaming enabled", { type: "http", url });
    return;
  }

  if (type === "datadog") {
    const apiKey = process.env.DD_API_KEY?.trim() || process.env.LOG_STREAM_API_KEY?.trim();
    if (!apiKey) {
      console.warn("[openflow] LOG_STREAM_TYPE=datadog requires DD_API_KEY");
      return;
    }
    addLogSink(
      createDatadogLogSink({
        apiKey,
        site: process.env.DD_SITE,
        service: process.env.DD_SERVICE ?? service,
      }),
    );
    log.info("log streaming enabled", { type: "datadog" });
  }
}
