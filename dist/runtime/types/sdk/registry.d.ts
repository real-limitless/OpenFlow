import type { NodeDefinition, NodeExecutor } from "./types";
export interface NodeRegistry {
    register(definition: NodeDefinition): void;
    get(type: string): NodeDefinition | undefined;
    has(type: string): boolean;
    types(): string[];
    toExecutorMap(): Record<string, NodeExecutor>;
}
export declare function createNodeRegistry(initial?: NodeDefinition[]): NodeRegistry;
/** Build an executor map from legacy (type → NodeExecutor) records. */
export declare function executorMapFromRecord(record: Record<string, NodeExecutor>): Record<string, NodeExecutor>;
