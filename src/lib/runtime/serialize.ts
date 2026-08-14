import type { INode, IWorkflow } from "../workflow/types";
import { serializeWorkflow } from "../workflow/schema";
import { unsupportedLiteNodes } from "./validate";

export interface RuntimeCredentialSlot {
  slot: string;
  name: string;
  node: string;
  id?: string | null;
}

export interface RuntimeExport {
  workflow: IWorkflow;
  requiredCredentials: RuntimeCredentialSlot[];
  unsupportedNodes: Array<{ name: string; type: string }>;
  warnings: string[];
}

function stripNodeCredentials(node: INode): {
  node: INode;
  slots: RuntimeCredentialSlot[];
} {
  const creds = node.credentials;
  if (!creds || Object.keys(creds).length === 0) {
    return { node, slots: [] };
  }
  const slots: RuntimeCredentialSlot[] = [];
  const kept: NonNullable<INode["credentials"]> = {};
  for (const [slot, ref] of Object.entries(creds)) {
    slots.push({ slot, name: ref.name, node: node.name, id: ref.id });
    kept[slot] = { name: ref.name };
  }
  return { node: { ...node, credentials: kept }, slots };
}

export function serializeForRuntime(workflow: IWorkflow): RuntimeExport {
  const requiredCredentials: RuntimeCredentialSlot[] = [];
  const nodes = workflow.nodes.map((n) => {
    const { node, slots } = stripNodeCredentials(n);
    requiredCredentials.push(...slots);
    return node;
  });
  const next: IWorkflow = { ...workflow, nodes };
  const unsupportedNodes = unsupportedLiteNodes(next);
  const warnings: string[] = [];
  if (unsupportedNodes.length > 0) {
    warnings.push(`${unsupportedNodes.length} node(s) are not supported by the lite runtime`);
  }
  if (requiredCredentials.length > 0) {
    warnings.push(`${requiredCredentials.length} credential slot(s) must be bound by the host`);
  }
  return { workflow: next, requiredCredentials, unsupportedNodes, warnings };
}

export function serializeForRuntimeJson(workflow: IWorkflow): string {
  return serializeWorkflow(serializeForRuntime(workflow).workflow);
}
