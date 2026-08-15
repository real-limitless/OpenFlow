/** Classic workflow MCP scopes (safe default for agents). */
export const CLASSIC_MCP_SCOPES = [
  "openflow:read",
  "openflow:write",
  "openflow:execute",
] as const;

/**
 * Opt-in agent scopes for managing secrets/config.
 * Not included in empty/default agent scope lists.
 */
export const OPT_IN_MCP_SCOPES = [
  "openflow:credentials",
  "openflow:variables",
] as const;

/** All scopes advertised for OAuth / discovery (classic + opt-in). */
export const MCP_SCOPES = [...CLASSIC_MCP_SCOPES, ...OPT_IN_MCP_SCOPES] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const ALL_MCP_SCOPES: readonly string[] = [...MCP_SCOPES];

/** Default when an agent token omits scopes — classic only (no secret write). */
export const DEFAULT_AGENT_SCOPES: readonly string[] = [...CLASSIC_MCP_SCOPES];

/** Human session / AUTH_DISABLED — full capability including secret management. */
export const HUMAN_MCP_SCOPES: readonly string[] = [...MCP_SCOPES];

const ALLOWED = new Set<string>(ALL_MCP_SCOPES);

export function parseScopes(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [...DEFAULT_AGENT_SCOPES];
  const parts = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = parts.filter((p) => ALLOWED.has(p));
  return out.length > 0 ? out : [...DEFAULT_AGENT_SCOPES];
}

export function scopesToString(scopes: string[]): string {
  return scopes.join(" ");
}

export function hasScope(granted: string[] | undefined, needed: string): boolean {
  if (!granted || granted.length === 0) return true;
  return granted.includes(needed);
}

export function scopeForTool(toolName: string): string {
  switch (toolName) {
    case "list_workflows":
    case "get_workflow":
    case "list_node_types":
    case "get_node_type":
    case "list_credentials":
    case "list_variables":
    case "get_execution":
    case "list_executions":
    case "select_node":
    case "open_workflow":
      return "openflow:read";
    case "execute_workflow":
      return "openflow:execute";
    case "list_credential_types":
    case "create_credential":
    case "update_credential":
    case "delete_credential":
      return "openflow:credentials";
    case "create_variable":
    case "update_variable":
    case "delete_variable":
      return "openflow:variables";
    default:
      return "openflow:write";
  }
}
