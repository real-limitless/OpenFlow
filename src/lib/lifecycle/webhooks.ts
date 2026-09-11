import { createHmac } from "node:crypto";

export const LIFECYCLE_EVENTS = [
  "execution.started",
  "execution.succeeded",
  "execution.failed",
  "execution.waiting",
  "workflow.updated",
] as const;

export type LifecycleEventType = (typeof LIFECYCLE_EVENTS)[number];

export type LifecycleSubscription = {
  id: string;
  url: string;
  secret: string;
  events: LifecycleEventType[];
  enabled: boolean;
};

export type LifecycleDelivery = {
  at: string;
  subscriptionId: string;
  event: LifecycleEventType;
  url: string;
  ok: boolean;
  status: number | null;
  attempts: number;
  error?: string;
};

export type InternalWorkflowEvent =
  | { type: "execution.started"; workflowId: string; executionId: string; mode?: string }
  | {
      type: "execution.finished";
      workflowId: string;
      executionId: string;
      status: string;
      mode?: string;
    }
  | { type: "workflow.updated"; workflowId: string; source?: string };

export function mapLifecycleEvent(event: InternalWorkflowEvent): LifecycleEventType | null {
  if (event.type === "execution.started") return "execution.started";
  if (event.type === "workflow.updated") return "workflow.updated";
  if (event.type === "execution.finished") {
    if (event.status === "success") return "execution.succeeded";
    if (event.status === "waiting") return "execution.waiting";
    return "execution.failed";
  }
  return null;
}

export function signLifecycleBody(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyLifecycleSignature(opts: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  nowMs?: number;
  maxSkewMs?: number;
}): boolean {
  const now = opts.nowMs ?? Date.now();
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = opts.maxSkewMs ?? 5 * 60_000;
  if (Math.abs(now - ts) > skew) return false;
  const expected = signLifecycleBody(opts.secret, opts.timestamp, opts.body);
  return expected === opts.signature;
}

export function subscriptionWants(sub: LifecycleSubscription, event: LifecycleEventType): boolean {
  if (!sub.enabled) return false;
  if (!sub.url.trim()) return false;
  if (!sub.events.length) return true;
  return sub.events.includes(event);
}

export function parseLifecycleSubscriptions(raw: unknown): LifecycleSubscription[] {
  if (!Array.isArray(raw)) return [];
  const out: LifecycleSubscription[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) continue;
    const events = Array.isArray(o.events)
      ? o.events.filter((e): e is LifecycleEventType =>
          LIFECYCLE_EVENTS.includes(String(e) as LifecycleEventType),
        )
      : [...LIFECYCLE_EVENTS];
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
      url,
      secret: typeof o.secret === "string" ? o.secret : "",
      events,
      enabled: o.enabled !== false,
    });
  }
  return out;
}

export async function deliverLifecyclePayload(opts: {
  fetchImpl: typeof fetch;
  sub: LifecycleSubscription;
  event: LifecycleEventType;
  payload: Record<string, unknown>;
  nowMs?: number;
  retries?: number;
}): Promise<LifecycleDelivery> {
  const timestamp = String(opts.nowMs ?? Date.now());
  const body = JSON.stringify({ event: opts.event, timestamp, ...opts.payload });
  const signature = signLifecycleBody(opts.sub.secret, timestamp, body);
  const retries = opts.retries ?? 3;
  let lastStatus: number | null = null;
  let lastError: string | undefined;
  let attempts = 0;
  for (let i = 0; i < retries; i++) {
    attempts = i + 1;
    try {
      const res = await opts.fetchImpl(opts.sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenFlow-Event": opts.event,
          "X-OpenFlow-Timestamp": timestamp,
          "X-OpenFlow-Signature": signature,
        },
        body,
      });
      lastStatus = res.status;
      if (res.ok) {
        return {
          at: new Date(Number(timestamp)).toISOString(),
          subscriptionId: opts.sub.id,
          event: opts.event,
          url: opts.sub.url,
          ok: true,
          status: res.status,
          attempts,
        };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    at: new Date(Number(timestamp)).toISOString(),
    subscriptionId: opts.sub.id,
    event: opts.event,
    url: opts.sub.url,
    ok: false,
    status: lastStatus,
    attempts,
    error: lastError,
  };
}
