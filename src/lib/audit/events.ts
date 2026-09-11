export type AuditAction =
  | "user.role_change"
  | "user.invite_create"
  | "user.invite_revoke"
  | "user.register"
  | "share.create"
  | "share.delete"
  | "credential.create"
  | "credential.delete"
  | "settings.webhooks"
  | "settings.mcp"
  | "settings.code";

export type AuditEvent = {
  action: AuditAction | string;
  resource: string;
  resourceId: string;
  detail: Record<string, unknown>;
};

export function buildAuditEvent(
  action: AuditAction | string,
  resource: string,
  resourceId: string | undefined,
  detail?: unknown,
): AuditEvent {
  const safe: Record<string, unknown> = {};
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (key.includes("password") || key.includes("secret") || key.includes("token") || key.includes("key")) {
        continue;
      }
      safe[k] = v;
    }
  }
  return {
    action,
    resource,
    resourceId: resourceId ?? "",
    detail: safe,
  };
}
