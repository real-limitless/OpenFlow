export const LITE_NODE_TYPES = [
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.manualWorkflowTrigger",
  "n8n-nodes-base.start",
  "n8n-nodes-base.set",
  "n8n-nodes-base.if",
  "n8n-nodes-base.switch",
  "n8n-nodes-base.merge",
  "n8n-nodes-base.filter",
  "n8n-nodes-base.noOp",
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.code",
  "n8n-nodes-base.function",
  "n8n-nodes-base.functionItem",
  "n8n-nodes-base.stickyNote",
] as const;

export const HARNESS_EXTRA_TYPES = [
  "@n8n/n8n-nodes-langchain.agent",
  "@n8n/n8n-nodes-langchain.lmChatOpenRouter",
  "n8n-nodes-base.httpRequestTool",
  "n8n-nodes-base.githubTool",
  "n8n-nodes-base.executeCommandTool",
  "n8n-nodes-base.webSearchTool",
  "n8n-nodes-base.gitTool",
  "n8n-nodes-base.filesystemTool",
] as const;

export const HARNESS_NODE_TYPES = [...LITE_NODE_TYPES, ...HARNESS_EXTRA_TYPES] as const;

export const HARNESS_TOOL_TYPES = [
  "n8n-nodes-base.httpRequestTool",
  "n8n-nodes-base.githubTool",
  "n8n-nodes-base.executeCommandTool",
  "n8n-nodes-base.webSearchTool",
  "n8n-nodes-base.gitTool",
  "n8n-nodes-base.filesystemTool",
] as const;

export type LiteNodeType = (typeof LITE_NODE_TYPES)[number];
export type RuntimePreset = "lite" | "harness";

export function expandTypeAliases(type: string): string[] {
  const out = new Set<string>([type]);
  if (type.startsWith("n8n-")) out.add(type.slice(4));
  if (type.startsWith("n8n-nodes-base.")) {
    out.add(type.replace("n8n-nodes-base.", "openflow-node-base."));
  }
  if (type.startsWith("@n8n/n8n-nodes-langchain.")) {
    const rest = type.slice("@n8n/n8n-nodes-langchain.".length);
    out.add(`openflow-node-langchain.${rest}`);
    out.add(`n8n-nodes-langchain.${rest}`);
  }
  if (type.startsWith("openflow-node-base.")) {
    out.add(type.replace("openflow-node-base.", "n8n-nodes-base."));
    out.add(type.replace("openflow-node-base.", "nodes-base."));
  }
  if (type.startsWith("openflow-node-langchain.")) {
    const rest = type.slice("openflow-node-langchain.".length);
    out.add(`@n8n/n8n-nodes-langchain.${rest}`);
    out.add(`n8n-nodes-langchain.${rest}`);
  }
  return [...out];
}

function buildSet(types: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const t of types) {
    for (const a of expandTypeAliases(t)) set.add(a);
  }
  return set;
}

const LITE_SET = buildSet(LITE_NODE_TYPES);
const HARNESS_SET = buildSet(HARNESS_NODE_TYPES);
const TOOL_SET = buildSet(HARNESS_TOOL_TYPES);

export function normalizeNodeType(type: string): string {
  return type.startsWith("n8n-") ? type : `n8n-${type}`;
}

export function isLiteNodeType(type: string): boolean {
  return LITE_SET.has(type);
}

export function isHarnessNodeType(type: string): boolean {
  return HARNESS_SET.has(type);
}

export function isHarnessToolType(type: string): boolean {
  return TOOL_SET.has(type);
}

export function allowlistForPreset(preset: RuntimePreset): readonly string[] {
  return preset === "harness" ? HARNESS_NODE_TYPES : LITE_NODE_TYPES;
}

export function isAllowedType(type: string, preset: RuntimePreset): boolean {
  return preset === "harness" ? isHarnessNodeType(type) : isLiteNodeType(type);
}

export function toolPolicyKey(type: string): string {
  return type.split(".").pop() ?? type;
}

export const LITE_TRIGGER_TYPES = new Set([
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.manualWorkflowTrigger",
  "n8n-nodes-base.start",
  "nodes-base.manualTrigger",
  "nodes-base.manualWorkflowTrigger",
  "nodes-base.start",
]);
