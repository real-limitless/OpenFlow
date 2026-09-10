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
export declare const OPENFLOW_BASE_PREFIX = "openflow-node-base.";
export declare const OPENFLOW_LANGCHAIN_PREFIX = "openflow-node-langchain.";
export declare const OPENFLOW_MCP_PREFIX = "openflow-node-mcp.";
export declare const WIRE_BASE_PREFIX = "n8n-nodes-base.";
export declare const WIRE_LANGCHAIN_PREFIX = "@n8n/n8n-nodes-langchain.";
export declare const WIRE_MCP_PREFIX = "n8n-nodes-mcp.";
/** Legacy dualKey strip of n8n- prefix */
export declare const LEGACY_BASE_PREFIX = "nodes-base.";
/** Map any known form of a type id to the OpenFlow canonical form. */
export declare function toCanonicalType(type: string): string;
/** Map to public n8n-compatible wire type for export. Native openflow.* unchanged. */
export declare function toWireType(type: string): string;
/** Spec file path relative to repo root (specs still use wire filenames). */
export declare function specPathForType(type: string): string;
/**
 * All registry keys that should resolve to the same executor/description.
 * Order: canonical first, then wire, then legacy short forms.
 */
export declare function typeKeys(type: string): string[];
export declare function typesEqual(a: string, b: string): boolean;
export declare function isBasePackageType(type: string): boolean;
export declare function isLangchainPackageType(type: string): boolean;
/** Default public GitHub repo (overridable via VITE_OPENFLOW_REPO_URL). */
export declare const DEFAULT_OPENFLOW_REPO = "https://github.com/real-limitless/OpenFlow";
export declare function openflowRepoBase(): string;
export declare function specBlobUrl(type: string, branch?: string): string;
export declare function githubNewIssueUrl(params: {
    title: string;
    body: string;
    labels?: string[];
    template?: string;
}): string;
