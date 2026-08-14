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

export type LiteNodeType = (typeof LITE_NODE_TYPES)[number];

const CANONICAL = new Set<string>(LITE_NODE_TYPES);

export function normalizeNodeType(type: string): string {
  return type.startsWith("n8n-") ? type : `n8n-${type}`;
}

export function isLiteNodeType(type: string): boolean {
  if (CANONICAL.has(type)) return true;
  if (CANONICAL.has(normalizeNodeType(type))) return true;
  if (type.startsWith("n8n-") && CANONICAL.has(type.slice(4))) return true;
  return false;
}

export const LITE_TRIGGER_TYPES = new Set([
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.manualWorkflowTrigger",
  "n8n-nodes-base.start",
  "nodes-base.manualTrigger",
  "nodes-base.manualWorkflowTrigger",
  "nodes-base.start",
]);
