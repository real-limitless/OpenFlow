import type { INodeTypeDescription, NodeCategory } from "./types";
import { manualTrigger, scheduleTrigger, webhook, respondToWebhook } from "./definitions/triggers";
import { httpRequest, set, code, noOp, stickyNote } from "./definitions/core";
import { ifNode, switchNode, merge, wait, splitInBatches } from "./definitions/flow";
import {
  splitOut,
  aggregate,
  filter,
  limit,
  removeDuplicates,
  itemLists,
  dateTime,
  executeWorkflow,
} from "./definitions/transform";

const definitions: INodeTypeDescription[] = [
  manualTrigger,
  webhook,
  scheduleTrigger,
  respondToWebhook,
  httpRequest,
  set,
  code,
  ifNode,
  switchNode,
  merge,
  wait,
  splitInBatches,
  splitOut,
  aggregate,
  filter,
  limit,
  removeDuplicates,
  itemLists,
  dateTime,
  executeWorkflow,
  noOp,
  stickyNote,
];

const byName = new Map<string, INodeTypeDescription>();
for (const def of definitions) {
  byName.set(def.name, def);
  // Also register the bare key so both "nodes-base.x" and "n8n-nodes-base.x" resolve.
  byName.set(def.name.replace(/^n8n-/, ""), def);
}

/** Aliases for type strings seen in public exports that map to the same node. */
const aliases: Record<string, string> = {
  "n8n-nodes-base.manualWorkflowTrigger": manualTrigger.name,
  "n8n-nodes-base.start": manualTrigger.name,
  "n8n-nodes-base.function": code.name,
  "n8n-nodes-base.functionItem": code.name,
  "n8n-nodes-base.noOp ": noOp.name,
};

export const NODE_CATEGORIES: NodeCategory[] = [
  "Triggers",
  "Actions",
  "Flow",
  "Transform",
  "Helpers",
];

export function allNodeTypes(): INodeTypeDescription[] {
  return definitions;
}

export function isSupportedType(type: string): boolean {
  return byName.has(type) || type in aliases;
}

export function makePlaceholderDescription(type: string): INodeTypeDescription {
  const short = type.split(".").pop() ?? type;
  const displayName = short
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
  return {
    name: type,
    displayName,
    category: "Helpers",
    group: ["transform"],
    version: 1,
    description: "This node type is not implemented yet. Its parameters are preserved on export.",
    defaults: { name: displayName },
    inputs: ["main"],
    outputs: ["main"],
    icon: "PackageOpen",
    properties: [
      {
        displayName:
          "Not implemented yet. Parameters below are shown read-only as raw JSON and are exported unchanged.",
        name: "notice",
        type: "notice",
        default: "",
      },
    ],
    sources: [],
    placeholder: true,
  };
}

export function getNodeType(type: string): INodeTypeDescription {
  const resolved = aliases[type] ?? type;
  return byName.get(resolved) ?? makePlaceholderDescription(type);
}

export const STICKY_NOTE_TYPE = stickyNote.name;
