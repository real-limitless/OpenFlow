import { randomBytes } from "node:crypto";
import { config } from "../../config";

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  traceparent: string;
};

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export function parseTraceparent(header: string | undefined): TraceContext {
  const match = header?.trim().match(TRACEPARENT);
  const parentSpanId = match?.[2]?.toLowerCase() ?? null;
  const traceId = match?.[1]?.toLowerCase() ?? randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const flags = match?.[3]?.toLowerCase() ?? "01";
  return {
    traceId,
    spanId,
    parentSpanId,
    traceparent: `00-${traceId}-${spanId}-${flags}`,
  };
}

export async function exportSpan(input: {
  trace: TraceContext;
  name: string;
  startMs: number;
  endMs: number;
  statusCode: number;
  attributes: Record<string, string | number>;
}): Promise<void> {
  const endpoint = config.observability.otelExporterOtlpEndpoint;
  if (!endpoint) return;
  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "openflow" } },
            { key: "service.version", value: { stringValue: "0.1.0" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "openflow.http" },
            spans: [
              {
                traceId: input.trace.traceId,
                spanId: input.trace.spanId,
                parentSpanId: input.trace.parentSpanId ?? undefined,
                name: input.name,
                kind: 2,
                startTimeUnixNano: String(BigInt(input.startMs) * 1_000_000n),
                endTimeUnixNano: String(BigInt(input.endMs) * 1_000_000n),
                status: { code: input.statusCode >= 500 ? 2 : 1 },
                attributes: Object.entries(input.attributes).map(([key, value]) =>
                  typeof value === "number"
                    ? { key, value: { intValue: String(value) } }
                    : { key, value: { stringValue: value } },
                ),
              },
            ],
          },
        ],
      },
    ],
  };
  try {
    const url = endpoint.replace(/\/$/, "") + "/v1/traces";
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* exporter must never break requests */
  }
}
