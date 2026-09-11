import { defineNode, definitionToExecutor, type NodeDefinition } from "@/sdk";
import type { INodeTypeDescription } from "@/lib/nodes/types";

export type PluginManifest = {
  id: string;
  publisher: string;
  version: string;
  displayName: string;
  nodes: NodeDefinition[];
};

export class PluginValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginValidationError";
  }
}

const FORBIDDEN_TYPE = /^(n8n-nodes-|n8n-nodes-base\.|n8n-nodes-langchain\.)/i;
const ALLOWED_TYPE = /^(openflow-plugin\.|openflow-node-)/;

export function assertSafeNodeType(type: string): void {
  if (!type || typeof type !== "string") {
    throw new PluginValidationError("Plugin node type is required");
  }
  if (FORBIDDEN_TYPE.test(type) || type.startsWith("n8n-nodes-")) {
    throw new PluginValidationError(
      `Refusing to load '${type}': OpenFlow plugins cannot use n8n-nodes-* packages or types`,
    );
  }
  if (!ALLOWED_TYPE.test(type)) {
    throw new PluginValidationError(
      `Plugin node type '${type}' must start with openflow-plugin. or openflow-node-`,
    );
  }
}

export function validatePluginManifest(
  raw: PluginManifest,
  allowPublishers: string[],
): PluginManifest {
  if (!raw.id?.trim()) throw new PluginValidationError("Plugin id is required");
  if (!raw.publisher?.trim()) throw new PluginValidationError("Plugin publisher is required");
  const allow = new Set(allowPublishers.map((p) => p.trim().toLowerCase()).filter(Boolean));
  if (allow.size > 0 && !allow.has(raw.publisher.trim().toLowerCase())) {
    throw new PluginValidationError(`Publisher '${raw.publisher}' is not on the instance allowlist`);
  }
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    throw new PluginValidationError("Plugin must declare at least one defineNode");
  }
  for (const node of raw.nodes) {
    if (typeof node.execute !== "function") {
      throw new PluginValidationError(`Plugin node '${node.type}' is missing execute (defineNode)`);
    }
    assertSafeNodeType(node.type);
  }
  return raw;
}

export function helloPlugin(): PluginManifest {
  const type = "openflow-plugin.hello";
  const description: INodeTypeDescription = {
    displayName: "Hello (plugin)",
    name: type,
    category: "Transform",
    group: ["transform"],
    version: 1,
    description: "Sample allowlisted OpenFlow defineNode plugin. Not an n8n community package.",
    defaults: { name: "Hello" },
    inputs: ["main"],
    outputs: ["main"],
    icon: "Puzzle",
    sources: [],
    properties: [
      {
        displayName: "Greeting",
        name: "greeting",
        type: "string",
        default: "hello from OpenFlow plugin",
      },
    ],
  };
  const def = defineNode({
    type,
    description,
    async execute(ctx) {
      const greeting = String(ctx.getParam("greeting", "hello from OpenFlow plugin"));
      const items = ctx.getInputItems(0);
      const source = items.length ? items : [{ json: {} }];
      return [
        source.map((item) => ({
          json: { ...item.json, greeting, plugin: "openflow.hello" },
          pairedItem: item.pairedItem,
        })),
      ];
    },
  });
  return {
    id: "openflow.hello",
    publisher: "openflow",
    version: "1.0.0",
    displayName: "Hello",
    nodes: [def],
  };
}

export const BUILTIN_PLUGINS: PluginManifest[] = [helloPlugin()];

export function pluginExecutorMap(plugin: PluginManifest): Record<string, ReturnType<typeof definitionToExecutor>> {
  const map: Record<string, ReturnType<typeof definitionToExecutor>> = {};
  for (const node of plugin.nodes) {
    map[node.type] = definitionToExecutor(node);
  }
  return map;
}
