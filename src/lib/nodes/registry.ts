import type { INodeTypeDescription, NodeCategory } from "./types";
import {
  manualTrigger,
  scheduleTrigger,
  webhook,
  respondToWebhook,
  executeWorkflowTrigger,
  errorTrigger,
} from "./definitions/triggers";
import { httpRequest, set, code, noOp, stickyNote, stopAndError } from "./definitions/core";
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
  sort,
  renameKeys,
} from "./definitions/transform";
import {
  getDescription,
  listDescriptions,
  registerAlias,
  registerDescription,
} from "@/lib/engine/node-runtime";

const BUILTIN_DESCRIPTIONS: INodeTypeDescription[] = [
  manualTrigger,
  executeWorkflowTrigger,
  errorTrigger,
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
  sort,
  renameKeys,
  executeWorkflow,
  stopAndError,
  noOp,
  stickyNote,
];

const ALIAS_PAIRS: Array<[string, string]> = [
  ["n8n-nodes-base.manualWorkflowTrigger", manualTrigger.name],
  ["n8n-nodes-base.start", manualTrigger.name],
  ["n8n-nodes-base.function", code.name],
  ["n8n-nodes-base.functionItem", code.name],
];

let descriptionsSeeded = false;

export function seedBuiltinDescriptions(): void {
  for (const d of BUILTIN_DESCRIPTIONS) {
    registerDescription(d);
  }
  for (const [from, to] of ALIAS_PAIRS) {
    registerAlias(from, to);
  }
  descriptionsSeeded = true;
}

if (!descriptionsSeeded) {
  seedBuiltinDescriptions();
}

/** @deprecated prefer registerDescription from node-runtime */
const aliases: Record<string, string> = Object.fromEntries(ALIAS_PAIRS);

export const NODE_CATEGORIES: NodeCategory[] = [
  "Triggers",
  "Actions",
  "Flow",
  "Transform",
  "Helpers",
];

export function allNodeTypes(): INodeTypeDescription[] {
  return listDescriptions();
}

export function isSupportedType(type: string): boolean {
  if (getDescription(type)) return true;
  if (type in aliases) return true;
  return false;
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
  return getDescription(resolved) ?? makePlaceholderDescription(type);
}

export function registerNodeDescription(description: INodeTypeDescription): void {
  registerDescription(description);
}

export const STICKY_NOTE_TYPE = stickyNote.name;
