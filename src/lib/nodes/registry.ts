import type { INodeTypeDescription, NodeCategory } from "./types";
import {
  getDescription,
  listDescriptions,
  registerAlias,
  registerDescription,
} from "@/lib/engine/node-runtime";
import * as definitions from "./definitions";
import { manualTrigger, formTrigger, googleSheetsTrigger, typeformTrigger } from "./definitions/triggers";
import { code, stickyNote } from "./definitions/core";
import { xml, openAiApp } from "./definitions/transform";
import { form } from "./definitions/helpers";
import { deepLTool } from "./definitions/tools";

/**
 * Every node description exported from ./definitions is seeded automatically,
 * so adding a node means adding one `export const` there — this file needs no
 * per-node edit.
 */
const BUILTIN_DESCRIPTIONS = Object.values(definitions).filter(
  (d): d is INodeTypeDescription =>
    typeof d === "object" && d !== null && typeof (d as INodeTypeDescription).name === "string",
);

const ALIAS_PAIRS: Array<[string, string]> = [
  ["n8n-nodes-base.manualWorkflowTrigger", manualTrigger.name],
  ["n8n-nodes-base.start", manualTrigger.name],
  ["n8n-nodes-base.function", code.name],
  ["n8n-nodes-base.functionItem", code.name],
  ["Parse", xml.name],
  ["table", formTrigger.name],
  ["submit", formTrigger.name],
  ["post", formTrigger.name],
  ["ChatGPT", openAiApp.name],
  ["DallE", openAiApp.name],
  ["_Form", form.name],
  ["form", form.name],
  ["page", form.name],
  ["step", form.name],
  ["stage", form.name],
  ["multi", form.name],
  ["CSV", googleSheetsTrigger.name],
  ["Spreadsheet", googleSheetsTrigger.name],
  ["GS", googleSheetsTrigger.name],
  ["Form", typeformTrigger.name],
  ["Translate", deepLTool.name],
  ["Translator", deepLTool.name],
  ["Shipping", "n8n-nodes-base.dhlTool"],
  ["n8n-nodes-base.discourseTool", "n8n-nodes-base.discourse"],
  ["n8n-nodes-base.driftTool", "n8n-nodes-base.drift"],
  ["n8n-nodes-base.egoiTool", "n8n-nodes-base.egoi"],
  ["n8n-nodes-base.elasticSecurity", "n8n-nodes-base.elasticSecurityTool"],
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

/**
 * Palette groups, in display order. NodePalette renders exactly this list, so
 * every NodeCategory must appear here — one that is missing silently hides all
 * of its nodes, including from search.
 *
 * Ordered by how often a category is reached: the core building blocks first,
 * then the app/domain groups alphabetically, then the catch-alls.
 */
export const NODE_CATEGORIES: NodeCategory[] = [
  "Triggers",
  "Actions",
  "Flow",
  "Transform",
  "Helpers",
  "AI",
  "AI Tool",
  "Communication",
  "Data & Storage",
  "Database",
  "Development",
  "Files",
  "Productivity",
  "Marketing",
  "Sales",
  "CRM",
  "Finance & Accounting",
  "Payments",
  "Analytics",
  "App",
  "Core",
  "Utility",
  "Miscellaneous",
  "Canvas",
];

/** Canvas-only annotation / inspect nodes (no execution edges). */
export const INSPECT_TABLE_TYPE = "openflow.inspectTable";
export const INSPECT_MEDIA_TYPE = "openflow.inspectMedia";

export function isCanvasInspectType(type: string): boolean {
  return type === INSPECT_TABLE_TYPE || type === INSPECT_MEDIA_TYPE;
}

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
