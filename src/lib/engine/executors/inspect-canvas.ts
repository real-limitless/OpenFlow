import type { NodeExecutor } from "@/sdk";

/** Canvas inspect widgets never produce items. */
export const inspectTableExecutor: NodeExecutor = async () => [];
export const inspectMediaExecutor: NodeExecutor = async () => [];
