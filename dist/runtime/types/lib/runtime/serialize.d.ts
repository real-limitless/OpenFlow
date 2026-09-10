import type { IWorkflow } from "../workflow/types";
import type { RuntimePreset } from "./allowlist";
export interface RuntimeCredentialSlot {
    slot: string;
    name: string;
    node: string;
    id?: string | null;
}
export interface RuntimeExport {
    workflow: IWorkflow;
    requiredCredentials: RuntimeCredentialSlot[];
    unsupportedNodes: Array<{
        name: string;
        type: string;
    }>;
    warnings: string[];
}
export declare function serializeForRuntime(workflow: IWorkflow, preset?: RuntimePreset): RuntimeExport;
export declare function serializeForRuntimeJson(workflow: IWorkflow): string;
