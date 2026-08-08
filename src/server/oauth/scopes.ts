export const MCP_SCOPES = [
  "openflow:read",
  "openflow:write",
  "openflow:execute",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const ALL_MCP_SCOPES: readonly string[] = [...MCP_SCOPES];

export function parseScopes(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [...ALL_MCP_SCOPES];
  const parts = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set<string>(ALL_MCP_SCOPES);
  const out = parts.filter((p) => allowed.has(p));
  return out.length > 0 ? out : [...ALL_MCP_SCOPES];
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
    case "get_execution":
    case "list_executions":
    case "select_node":
    case "open_workflow":
      return "openflow:read";
    case "execute_workflow":
      return "openflow:execute";
    default:
      return "openflow:write";
  }
}
