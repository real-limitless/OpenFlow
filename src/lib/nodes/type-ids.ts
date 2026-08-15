/**
 * OpenFlow canonical node type ids with n8n wire-string aliases for import/export.
 *
 * Canonical:
 *   openflow-node-base.<short>
 *   openflow-node-langchain.<short>
 *   openflow.*  (native-only)
 *
 * Wire (n8n-compatible JSON):
 *   n8n-nodes-base.<short>
 *   @n8n/n8n-nodes-langchain.<short>
 */

export const OPENFLOW_BASE_PREFIX = "openflow-node-base.";
export const OPENFLOW_LANGCHAIN_PREFIX = "openflow-node-langchain.";
export const OPENFLOW_MCP_PREFIX = "openflow-node-mcp.";
export const WIRE_BASE_PREFIX = "n8n-nodes-base.";
export const WIRE_LANGCHAIN_PREFIX = "@n8n/n8n-nodes-langchain.";
export const WIRE_MCP_PREFIX = "n8n-nodes-mcp.";
/** Legacy dualKey strip of n8n- prefix */
export const LEGACY_BASE_PREFIX = "nodes-base.";

const WIRE_LC = WIRE_LANGCHAIN_PREFIX;
const CANON_LC = OPENFLOW_LANGCHAIN_PREFIX;

/** Map any known form of a type id to the OpenFlow canonical form. */
export function toCanonicalType(type: string): string {
  if (!type) return type;
  if (
    type.startsWith(OPENFLOW_BASE_PREFIX) ||
    type.startsWith(OPENFLOW_LANGCHAIN_PREFIX) ||
    type.startsWith(OPENFLOW_MCP_PREFIX)
  ) {
    return type;
  }
  if (type.startsWith(WIRE_BASE_PREFIX)) {
    return OPENFLOW_BASE_PREFIX + type.slice(WIRE_BASE_PREFIX.length);
  }
  if (type.startsWith(LEGACY_BASE_PREFIX)) {
    return OPENFLOW_BASE_PREFIX + type.slice(LEGACY_BASE_PREFIX.length);
  }
  if (type.startsWith(WIRE_LC)) {
    return CANON_LC + type.slice(WIRE_LC.length);
  }
  // bare n8n-nodes-langchain.X (rare flat form)
  if (type.startsWith("n8n-nodes-langchain.")) {
    return CANON_LC + type.slice("n8n-nodes-langchain.".length);
  }
  if (type.startsWith(WIRE_MCP_PREFIX)) {
    return OPENFLOW_MCP_PREFIX + type.slice(WIRE_MCP_PREFIX.length);
  }
  return type;
}

/** Map to public n8n-compatible wire type for export. Native openflow.* unchanged. */
export function toWireType(type: string): string {
  if (!type) return type;
  if (type.startsWith(OPENFLOW_BASE_PREFIX)) {
    return WIRE_BASE_PREFIX + type.slice(OPENFLOW_BASE_PREFIX.length);
  }
  if (type.startsWith(OPENFLOW_LANGCHAIN_PREFIX)) {
    return WIRE_LC + type.slice(OPENFLOW_LANGCHAIN_PREFIX.length);
  }
  if (type.startsWith(OPENFLOW_MCP_PREFIX)) {
    return WIRE_MCP_PREFIX + type.slice(OPENFLOW_MCP_PREFIX.length);
  }
  if (type.startsWith(LEGACY_BASE_PREFIX)) {
    return WIRE_BASE_PREFIX + type.slice(LEGACY_BASE_PREFIX.length);
  }
  // already wire or native
  return type;
}

/** Spec file path relative to repo root (specs still use wire filenames). */
export function specPathForType(type: string): string {
  // Wire langchain ids already include `@n8n/…`, which matches nested paths under docs/specs/nodes/.
  const wire = toWireType(toCanonicalType(type));
  return `docs/specs/nodes/${wire}.md`;
}

/**
 * All registry keys that should resolve to the same executor/description.
 * Order: canonical first, then wire, then legacy short forms.
 */
export function typeKeys(type: string): string[] {
  const canonical = toCanonicalType(type);
  const keys = new Set<string>([type, canonical]);

  if (canonical.startsWith(OPENFLOW_BASE_PREFIX)) {
    const short = canonical.slice(OPENFLOW_BASE_PREFIX.length);
    keys.add(OPENFLOW_BASE_PREFIX + short);
    keys.add(WIRE_BASE_PREFIX + short);
    keys.add(LEGACY_BASE_PREFIX + short);
  } else if (canonical.startsWith(OPENFLOW_LANGCHAIN_PREFIX)) {
    const short = canonical.slice(OPENFLOW_LANGCHAIN_PREFIX.length);
    keys.add(OPENFLOW_LANGCHAIN_PREFIX + short);
    keys.add(WIRE_LC + short);
    keys.add("n8n-nodes-langchain." + short);
  } else if (canonical.startsWith(OPENFLOW_MCP_PREFIX)) {
    const short = canonical.slice(OPENFLOW_MCP_PREFIX.length);
    keys.add(OPENFLOW_MCP_PREFIX + short);
    keys.add(WIRE_MCP_PREFIX + short);
    keys.add("nodes-mcp." + short);
  } else if (type.startsWith("n8n-") && !type.startsWith(WIRE_LC)) {
    keys.add(type);
    keys.add(type.replace(/^n8n-/, ""));
  }

  return [...keys];
}

export function typesEqual(a: string, b: string): boolean {
  return toCanonicalType(a) === toCanonicalType(b);
}

export function isBasePackageType(type: string): boolean {
  const c = toCanonicalType(type);
  return c.startsWith(OPENFLOW_BASE_PREFIX);
}

export function isLangchainPackageType(type: string): boolean {
  const c = toCanonicalType(type);
  return c.startsWith(OPENFLOW_LANGCHAIN_PREFIX);
}

/** Default public GitHub repo (overridable via VITE_OPENFLOW_REPO_URL). */
export const DEFAULT_OPENFLOW_REPO = "https://github.com/real-limitless/OpenFlow";

export function openflowRepoBase(): string {
  const env =
    typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_OPENFLOW_REPO_URL;
  if (env && typeof env === "string" && env.trim()) {
    return env.replace(/\/$/, "");
  }
  return DEFAULT_OPENFLOW_REPO;
}

export function specBlobUrl(type: string, branch = "main"): string {
  const path = specPathForType(type);
  return `${openflowRepoBase()}/blob/${branch}/${path}`;
}

export function githubNewIssueUrl(params: {
  title: string;
  body: string;
  labels?: string[];
  template?: string;
}): string {
  const base = `${openflowRepoBase()}/issues/new`;
  const q = new URLSearchParams();
  if (params.template) q.set("template", params.template);
  q.set("title", params.title);
  q.set("body", params.body);
  if (params.labels?.length) q.set("labels", params.labels.join(","));
  return `${base}?${q.toString()}`;
}
