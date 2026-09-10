import type { NodeExecutor } from "@/sdk";
import { type RuntimePreset } from "./allowlist";
export declare function createLiteExecutorMap(): Record<string, NodeExecutor>;
export declare function createRuntimeExecutorMap(preset: RuntimePreset): Record<string, NodeExecutor>;
