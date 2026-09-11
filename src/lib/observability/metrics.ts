/** In-process Prometheus text exposition (no prom-client). */

type Labels = Record<string, string>;

function labelKey(name: string, labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (!keys.length) return name;
  const inner = keys.map((k) => `${k}="${escapeLabel(labels[k] ?? "")}"`).join(",");
  return `${name}{${inner}}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const counters = new Map<string, number>();
const gauges = new Map<string, number>();
const histograms = new Map<string, number[]>();
const startedAt = Date.now();

export function incCounter(name: string, labels: Labels = {}, by = 1) {
  const key = labelKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + by);
}

export function setGauge(name: string, value: number, labels: Labels = {}) {
  gauges.set(labelKey(name, labels), value);
}

export function observeHistogram(name: string, valueSeconds: number) {
  const bucket = histograms.get(name) ?? [];
  bucket.push(valueSeconds);
  if (bucket.length > 2000) bucket.shift();
  histograms.set(name, bucket);
}

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function renderHistogram(name: string, samples: number[], help: string): string[] {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
  const sorted = [...samples].sort((a, b) => a - b);
  for (const le of HTTP_BUCKETS) {
    const cumulative = sorted.filter((s) => s <= le).length;
    lines.push(`${name}_bucket{le="${le}"} ${cumulative}`);
  }
  lines.push(`${name}_bucket{le="+Inf"} ${sorted.length}`);
  const sum = samples.reduce((a, b) => a + b, 0);
  lines.push(`${name}_sum ${sum}`);
  lines.push(`${name}_count ${sorted.length}`);
  return lines;
}

export function renderPrometheus(): string {
  setGauge("openflow_up", 1);
  setGauge("openflow_process_start_time_seconds", startedAt / 1000);
  setGauge("openflow_process_uptime_seconds", (Date.now() - startedAt) / 1000);

  const lines: string[] = [];
  const seenHelp = new Set<string>();

  const emit = (metricName: string, type: string, help: string, key: string, value: number) => {
    if (!seenHelp.has(metricName)) {
      lines.push(`# HELP ${metricName} ${help}`);
      lines.push(`# TYPE ${metricName} ${type}`);
      seenHelp.add(metricName);
    }
    lines.push(`${key} ${value}`);
  };

  for (const [key, value] of counters) {
    const name = key.split("{")[0]!;
    emit(name, "counter", `${name} total`, key, value);
  }
  for (const [key, value] of gauges) {
    const name = key.split("{")[0]!;
    emit(name, "gauge", `${name}`, key, value);
  }
  for (const [name, samples] of histograms) {
    if (!samples.length) continue;
    lines.push(...renderHistogram(name, samples, `${name} seconds`));
  }

  lines.push(`# HELP openflow_build_info Build metadata`);
  lines.push(`# TYPE openflow_build_info gauge`);
  lines.push(`openflow_build_info{version="0.1.0"} 1`);
  return `${lines.join("\n")}\n`;
}

export function recordHttpRequest(method: string, route: string, status: number, durationMs: number) {
  const labels = {
    method: method.toUpperCase(),
    route: sanitizeRoute(route),
    status: String(status),
  };
  incCounter("openflow_http_requests_total", labels);
  observeHistogram("openflow_http_request_duration_seconds", durationMs / 1000);
}

function sanitizeRoute(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+/g, "/:n")
    .slice(0, 120);
}

export function recordExecution(
  event: "started" | "completed" | "failed" | "canceled" | "waiting",
) {
  incCounter("openflow_executions_total", { event });
}

export function recordWorkerJob(status: string) {
  incCounter("openflow_worker_jobs_total", { status });
}

export function snapshot(): {
  counters: number;
  gauges: number;
  histograms: number;
  uptimeSeconds: number;
} {
  return {
    counters: counters.size,
    gauges: gauges.size,
    histograms: histograms.size,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
}

export function resetMetricsForTests() {
  counters.clear();
  gauges.clear();
  histograms.clear();
}

export function metricsTokenFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (env.OPENFLOW_METRICS_TOKEN ?? env.METRICS_TOKEN ?? "").trim();
}
