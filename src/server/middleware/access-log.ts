import type { Context, Next } from "hono";
import type { AppEnv } from "./auth";
import { getRequestContext } from "../../lib/observability/request-context";
import { log, type LogLevel } from "../log";
import { recordAudit } from "../services/audit";

export type AccessClass = {
  event: string;
  outcome: string;
  action: string;
  level: LogLevel;
};

export function classifyHttpStatus(status: number): AccessClass {
  if (status === 429) {
    return { event: "rate_limit", outcome: "denied", action: "rate_limit", level: "warn" };
  }
  if (status === 401) {
    return { event: "auth_failure", outcome: "failure", action: "http.request", level: "warn" };
  }
  if (status === 403) {
    return { event: "denial", outcome: "denied", action: "http.request", level: "warn" };
  }
  if (status >= 500) {
    return { event: "error", outcome: "failure", action: "http.request", level: "error" };
  }
  return { event: "", outcome: "success", action: "http.request", level: "info" };
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/**
 * One JSON access line per request. Request id is taken from the incoming
 * X-Request-Id header or from the surrounding request context, then echoed
 * on the response.
 */
export async function accessLogMiddleware(c: Context<AppEnv>, next: Next) {
  const headerId = c.req.header("x-request-id")?.trim();
  const ctx = getRequestContext();
  const requestId = headerId || ctx?.requestId;
  if (requestId) c.header("X-Request-Id", requestId);

  let thrown = false;
  try {
    await next();
  } catch (err) {
    thrown = true;
    throw err;
  } finally {
    const status = thrown ? 500 : c.res.status;
    const noted = getRequestContext()?.access;
    const base = classifyHttpStatus(status);
    const event = noted?.event || base.event;
    const outcome = noted?.outcome || base.outcome;
    const action = noted?.action || base.action;
    const level: LogLevel =
      event === "rate_limit" || event === "denial" || event === "auth_failure"
        ? "warn"
        : event === "error" || status >= 500
          ? "error"
          : base.level;
    const path = pathnameOf(c.req.url);
    const method = c.req.method.toUpperCase();
    const actor = noted?.actor ?? getRequestContext()?.actor ?? null;

    log[level]("http_request", {
      event,
      outcome,
      action,
      status,
      path,
      method,
      actor,
      request_id: requestId ?? null,
    });

    if (status === 403 && !noted?.audited) {
      let actorId = "anonymous";
      try {
        const userId = c.get("userId");
        if (userId) actorId = userId;
      } catch {
        actorId = "anonymous";
      }
      void recordAudit({
        actorId,
        actor,
        action: action === "http.request" ? "auth.denied" : action,
        resource: "http",
        resourceId: path,
        detail: { method, status },
        ip: getRequestContext()?.clientIp ?? null,
        event: "denial",
        outcome: "denied",
      });
    }
  }
}
