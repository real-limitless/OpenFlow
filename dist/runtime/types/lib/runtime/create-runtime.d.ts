import type { CredentialData, CredentialResolver } from "../engine/credentials";
import { executeWorkflow, type RunResult } from "../engine/runner";
import type { IWorkflow } from "../workflow/types";
import { type RuntimePreset } from "./allowlist";
import { type RuntimeExport } from "./serialize";
export type LiteCredentials = CredentialResolver | Record<string, CredentialData>;
export interface CreateRuntimeOptions {
    credentials?: LiteCredentials;
    vars?: Record<string, unknown>;
    env?: Record<string, string>;
    envAllowlist?: string[];
    allowUrl?: (url: string) => boolean;
    preset?: RuntimePreset;
    allowedTools?: string[];
    fsRoot?: string;
}
export interface RuntimeRunOptions {
    input?: unknown;
    startNode?: string | null;
    onProgress?: Parameters<typeof executeWorkflow>[0]["onProgress"];
}
export interface LiteRuntime {
    supportedTypes(): readonly string[];
    validate(workflow: IWorkflow | string): RuntimeExport;
    run(workflow: IWorkflow | string, options?: RuntimeRunOptions): Promise<RunResult>;
}
export declare function createRuntime(options?: CreateRuntimeOptions): LiteRuntime;
