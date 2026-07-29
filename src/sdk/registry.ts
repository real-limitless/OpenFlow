import type { NodeDefinition, NodeExecutor } from "./types";
import { definitionToExecutor } from "./define-node";

export interface NodeRegistry {
  register(definition: NodeDefinition): void;
  get(type: string): NodeDefinition | undefined;
  has(type: string): boolean;
  types(): string[];
  toExecutorMap(): Record<string, NodeExecutor>;
}

export function createNodeRegistry(
  initial: NodeDefinition[] = [],
): NodeRegistry {
  const byType = new Map<string, NodeDefinition>();

  const register = (definition: NodeDefinition) => {
    byType.set(definition.type, definition);
    // bare key without n8n- prefix for dual resolve
    if (definition.type.startsWith("n8n-")) {
      byType.set(definition.type.replace(/^n8n-/, ""), definition);
    }
  };

  for (const d of initial) register(d);

  return {
    register,
    get(type: string) {
      return byType.get(type);
    },
    has(type: string) {
      return byType.has(type);
    },
    types() {
      return [...new Set([...byType.values()].map((d) => d.type))];
    },
    toExecutorMap() {
      const map: Record<string, NodeExecutor> = {};
      const seen = new Set<NodeDefinition>();
      for (const def of byType.values()) {
        if (seen.has(def)) continue;
        seen.add(def);
        const exec = definitionToExecutor(def);
        map[def.type] = exec;
        if (def.type.startsWith("n8n-")) {
          map[def.type.replace(/^n8n-/, "")] = exec;
        }
      }
      return map;
    },
  };
}

/** Build an executor map from legacy (type → NodeExecutor) records. */
export function executorMapFromRecord(
  record: Record<string, NodeExecutor>,
): Record<string, NodeExecutor> {
  return { ...record };
}
