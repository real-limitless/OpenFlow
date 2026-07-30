import type { INodeTypeDescription, NodeCategory } from "./types";
import {
  manualTrigger,
  scheduleTrigger,
  webhook,
  respondToWebhook,
  executeWorkflowTrigger,
  errorTrigger,
  formTrigger,
  sseTrigger,
  localFileTrigger,
  chatTrigger,
  mcpTrigger,
  workflowTrigger,
} from "./definitions/triggers";
import {
  httpRequest,
  set,
  code,
  noOp,
  stickyNote,
  stopAndError,
  ftp,
  ssh,
  emailSend,
  lmChatOpenAi,
  lmChatGoogleGemini,
  lmChatAnthropic,
  lmChatOllama,
  lmChatOpenRouter,
  langchainAgent,
  chainRetrievalQa,
  chainSummarization,
  chainLlm,
  outputParserStructured,
  mcpClientTool,
  memoryBufferWindow,
  crypto,
  executionData,
  git,
  readWriteFile,
  rssFeedRead,
  graphql,
  openAi,
  whatsApp,
  telegram,
  twilio,
  vectorStoreInMemory,
  documentDefaultDataLoader,
  textSplitterRecursiveCharacterTextSplitter,
  embeddingsOpenAi,
} from "./definitions/core";
import { ifNode, switchNode, merge, wait, splitInBatches } from "./definitions/flow";
import { splitOut, aggregate, summarize, filter, limit, executeWorkflow, removeDuplicates, itemLists, dateTime, sort, renameKeys, convertToFile, extractFromFile, dataTable, compareDatasets, executeCommand, html, xml, markdown, compression, jwt, aiTransform, editImage, webflow, gmail, slack, discord } from "./definitions/transform";
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
  executeCommand,
  splitOut,
  aggregate,
  summarize,
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
  ftp,
  ssh,
  convertToFile,
  extractFromFile,
  readWriteFile,
  rssFeedRead,
  emailSend,
  dataTable,
  compareDatasets,
  lmChatOpenAi,
  lmChatGoogleGemini,
  lmChatAnthropic,
  lmChatOllama,
  lmChatOpenRouter,
  langchainAgent,
  chainRetrievalQa,
  chainSummarization,
  chainLlm,
  outputParserStructured,
  mcpClientTool,
  memoryBufferWindow,
  crypto,
  xml,
  html,
  markdown,
  editImage,
  jwt,
  compression,
  aiTransform,
  executionData,
  git,
  formTrigger,
  sseTrigger,
  localFileTrigger,
  chatTrigger,
  mcpTrigger,
  workflowTrigger,
  graphql,
  openAi,
  whatsApp,
  telegram,
  vectorStoreInMemory,
  documentDefaultDataLoader,
  textSplitterRecursiveCharacterTextSplitter,
  embeddingsOpenAi,
  gmail,
  slack,
  discord,
  twilio,
  webflow,
];

const ALIAS_PAIRS: Array<[string, string]> = [
  ["n8n-nodes-base.manualWorkflowTrigger", manualTrigger.name],
  ["n8n-nodes-base.start", manualTrigger.name],
  ["n8n-nodes-base.function", code.name],
  ["n8n-nodes-base.functionItem", code.name],
  ["Parse", xml.name],
  ["table", formTrigger.name],
  ["submit", formTrigger.name],
  ["post", formTrigger.name],
  ["n8n-nodes-base.openAi", openAi.name],
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
