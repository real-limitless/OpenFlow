export const LOG_EVENTS = [
  "auth_success",
  "auth_failure",
  "denial",
  "key_change",
  "config_change",
  "admin_action",
  "rate_limit",
  "error",
] as const;

export type SecurityEvent = (typeof LOG_EVENTS)[number];
export type SecurityOutcome = "success" | "failure" | "denied";

export function securityEventForAction(action: string): {
  event: SecurityEvent;
  outcome: SecurityOutcome;
} {
  if (action === "auth.login_success" || action === "auth.success" || action === "user.register") {
    return {
      event: action === "user.register" ? "admin_action" : "auth_success",
      outcome: "success",
    };
  }
  if (
    action === "auth.login_failure" ||
    action === "auth.failure" ||
    action.startsWith("auth.login_failure")
  ) {
    return { event: "auth_failure", outcome: "failure" };
  }
  if (
    action.includes("denied") ||
    action.includes("denial") ||
    action === "api_key.expired" ||
    action === "api_key.use_denied" ||
    action === "rate_limit"
  ) {
    if (action === "rate_limit") return { event: "rate_limit", outcome: "denied" };
    return { event: "denial", outcome: "denied" };
  }
  if (action.startsWith("api_key.") || action.startsWith("key.")) {
    return { event: "key_change", outcome: "success" };
  }
  if (
    action.startsWith("settings.") ||
    action.startsWith("config.") ||
    action.startsWith("credential.")
  ) {
    return { event: "config_change", outcome: "success" };
  }
  if (action.startsWith("user.") || action.startsWith("admin.") || action.startsWith("share.")) {
    return { event: "admin_action", outcome: "success" };
  }
  if (action.startsWith("error.") || action === "error") {
    return { event: "error", outcome: "failure" };
  }
  return { event: "admin_action", outcome: "success" };
}
