import type { IWorkflow } from "../workflow/types";
import { type RuntimePreset } from "./allowlist";
export declare function unsupportedRuntimeNodes(workflow: IWorkflow, preset?: RuntimePreset): Array<{
    name: string;
    type: string;
}>;
export declare function unsupportedLiteNodes(workflow: IWorkflow): Array<{
    name: string;
    type: string;
}>;
export declare function assertLiteCompatible(workflow: IWorkflow, preset?: RuntimePreset): void;
export declare function assertToolPolicy(workflow: IWorkflow, allowedTools?: string[]): void;
