export declare const CODE_PYTHON_ALLOW_IMPORTS_KEY = "code.pythonAllowImports";
export declare const MCP_ENABLED_KEY = "mcp.enabled";
export type CodePythonSettings = {
    /** Extra module roots allowed beyond the built-in safe stdlib list. */
    allowImports: string[];
};
export type McpInstanceSettings = {
    /** null = no DB override (use env/default). */
    enabledOverride: boolean | null;
};
export declare function normalizeImportList(input: unknown): string[];
export declare function invalidateInstanceSettingsCache(): void;
export declare function getMcpInstanceSettings(): Promise<McpInstanceSettings>;
/**
 * Effective MCP enablement:
 * - OPENFLOW_MCP_ENABLED=false|0 → always off (ops kill-switch)
 * - else DB mcp.enabled if set
 * - else env default (config.mcp.enabled, default on)
 */
export declare function isMcpEnabled(): Promise<boolean>;
export declare function setMcpEnabled(enabled: boolean): Promise<McpInstanceSettings>;
export declare function isEnvMcpDisabled(): boolean;
export declare function getCodePythonSettings(): Promise<CodePythonSettings>;
export declare function setCodePythonSettings(patch: Partial<CodePythonSettings>): Promise<CodePythonSettings>;
/** Merge DB allowlist with OPENFLOW_PYTHON_ALLOW_IMPORTS env (env appends). */
export declare function resolvePythonExtraImports(): Promise<string[]>;
