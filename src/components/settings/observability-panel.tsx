import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/client";

type ObservabilityInfo = {
  scrapePath: string;
  scrapeAuth: "none" | "bearer";
  otelExporter: "configured" | "unset";
  otelEndpoint: string | null;
  errorTracker: string;
  headers: { requestId: string; traceId: string; traceparent: string };
  snapshot: { counters: number; gauges: number; histograms: number; uptimeSeconds: number };
};

export function ObservabilityPanel() {
  const [info, setInfo] = useState<ObservabilityInfo | null>(null);
  const [sample, setSample] = useState<string>("");
  const [traceId, setTraceId] = useState<string>("");

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/api/v1/observability");
      if (res.ok) {
        setInfo((await res.json()) as ObservabilityInfo);
        setTraceId(res.headers.get("x-trace-id") ?? "");
      }
      const metrics = await fetch("/metrics");
      if (metrics.ok) {
        const text = await metrics.text();
        setSample(text.split("\n").slice(0, 24).join("\n"));
      }
    })();
  }, []);

  if (!info) {
    return <p className="text-[13px] text-muted-foreground">Loading observability…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-[15px] font-medium">Observability</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Prometheus scrape at <code className="rounded bg-muted px-1">{info.scrapePath}</code>.
          Request correlation uses <code className="rounded bg-muted px-1">{info.headers.requestId}</code>{" "}
          and W3C <code className="rounded bg-muted px-1">{info.headers.traceparent}</code>. Optional OTLP
          traces go to <code className="rounded bg-muted px-1">OTEL_EXPORTER_OTLP_ENDPOINT</code>.
        </p>
      </div>
      <ul className="space-y-1 text-[13px]">
        <li>
          <span className="font-medium text-foreground">Scrape auth:</span> {info.scrapeAuth}
        </li>
        <li>
          <span className="font-medium text-foreground">OTLP exporter:</span> {info.otelExporter}
          {info.otelEndpoint ? ` → ${info.otelEndpoint}` : ""}
        </li>
        <li>
          <span className="font-medium text-foreground">Error tracker:</span> {info.errorTracker}
        </li>
        <li>
          <span className="font-medium text-foreground">Series:</span> {info.snapshot.counters} counters,{" "}
          {info.snapshot.gauges} gauges, {info.snapshot.histograms} histograms
        </li>
        {traceId ? (
          <li>
            <span className="font-medium text-foreground">This page trace:</span>{" "}
            <code className="rounded bg-muted px-1">{traceId}</code>
          </li>
        ) : null}
      </ul>
      {sample ? (
        <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] text-foreground">
          {sample}
        </pre>
      ) : null}
    </div>
  );
}
