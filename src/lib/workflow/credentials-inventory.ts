import type { INode, INodeCredentialRef, IWorkflow } from "./types";
import type { CredentialMeta } from "../credentials/types";
import { getCredentialTypeDef, humanizeType } from "../credentials/types";
import { getNodeType } from "../nodes/registry";

export type CredentialSlotStatus = "ok" | "missing" | "unmapped";

export interface CredentialNodeUsage {
  nodeName: string;
  nodeType: string;
  ref?: INodeCredentialRef;
  required: boolean;
}

export interface CredentialSlot {
  /** Credential type name (e.g. ftp, openAiApi). */
  type: string;
  displayName: string;
  /** Unique key for UI rows: type + imported name (or type alone). */
  key: string;
  /** Preferred display/import name from the first ref. */
  suggestedName: string;
  importedId?: string | null;
  status: CredentialSlotStatus;
  /** Local credential that currently satisfies this slot (if any). */
  local?: CredentialMeta;
  nodes: CredentialNodeUsage[];
}

export interface CredentialInventory {
  slots: CredentialSlot[];
  missingCount: number;
}

function slotKey(type: string, ref?: INodeCredentialRef): string {
  const name = ref?.name?.trim();
  if (name) return `${type}::${name}`;
  if (ref?.id) return `${type}::id:${ref.id}`;
  return `${type}::`;
}

function resolveLocal(
  type: string,
  ref: INodeCredentialRef | undefined,
  locals: CredentialMeta[],
): CredentialMeta | undefined {
  const ofType = locals.filter((c) => c.type === type);
  if (ref?.id) {
    const byId = ofType.find((c) => c.id === ref.id) ?? locals.find((c) => c.id === ref.id);
    if (byId) return byId;
  }
  if (ref?.name) {
    const byName = ofType.find((c) => c.name === ref.name);
    if (byName) return byName;
  }
  return undefined;
}

/**
 * Collect every credential slot referenced by nodes (and declared on node types).
 * Cross-check against local credential metadata when provided.
 */
export function collectWorkflowCredentials(
  workflow: IWorkflow,
  localCredentials: CredentialMeta[] = [],
): CredentialInventory {
  const map = new Map<string, CredentialSlot>();

  const touch = (
    type: string,
    node: INode,
    ref: INodeCredentialRef | undefined,
    required: boolean,
  ) => {
    const key = slotKey(type, ref);
    let slot = map.get(key);
    if (!slot) {
      const local = resolveLocal(type, ref, localCredentials);
      const def = getCredentialTypeDef(type);
      let status: CredentialSlotStatus = "missing";
      if (local) status = "ok";
      else if (ref?.id || ref?.name) status = "unmapped";
      slot = {
        type,
        displayName: def.displayName || humanizeType(type),
        key,
        suggestedName: ref?.name?.trim() || def.displayName || type,
        importedId: ref?.id,
        status,
        local,
        nodes: [],
      };
      map.set(key, slot);
    } else if (required) {
      // keep
    }
    slot.nodes.push({
      nodeName: node.name,
      nodeType: node.type,
      ref,
      required,
    });
    // Re-evaluate status if locals provided and we didn't have a match yet
    if (slot.status !== "ok") {
      const local = resolveLocal(type, ref, localCredentials);
      if (local) {
        slot.local = local;
        slot.status = "ok";
      }
    }
  };

  for (const node of workflow.nodes ?? []) {
    if (node.disabled) continue;
    const description = getNodeType(node.type);
    const declared = description.credentials ?? [];
    const declaredNames = new Set(declared.map((c) => c.name));

    // Declared credential types on the node definition
    for (const d of declared) {
      const ref = node.credentials?.[d.name];
      touch(d.name, node, ref, d.required !== false);
    }

    // Refs present on the node but not in description (imported extras)
    for (const [type, ref] of Object.entries(node.credentials ?? {})) {
      if (declaredNames.has(type)) continue;
      touch(type, node, ref, true);
    }
  }

  const slots = [...map.values()].sort((a, b) => {
    const rank = (s: CredentialSlotStatus) => (s === "ok" ? 2 : s === "unmapped" ? 1 : 0);
    const dr = rank(a.status) - rank(b.status);
    if (dr !== 0) return dr;
    return a.displayName.localeCompare(b.displayName) || a.suggestedName.localeCompare(b.suggestedName);
  });

  const missingCount = slots.filter((s) => s.status !== "ok").length;
  return { slots, missingCount };
}

/**
 * Apply a map of slotKey → local credential onto a workflow copy.
 * Writes `node.credentials[type] = { id, name }` for every node in the slot.
 */
export function applyCredentialMappings(
  workflow: IWorkflow,
  inventory: CredentialInventory,
  mappings: Record<string, CredentialMeta>,
): IWorkflow {
  const nodeUpdates = new Map<string, Record<string, INodeCredentialRef>>();

  for (const slot of inventory.slots) {
    const local = mappings[slot.key];
    if (!local) continue;
    for (const usage of slot.nodes) {
      const current = nodeUpdates.get(usage.nodeName) ?? {};
      current[slot.type] = { id: local.id, name: local.name };
      nodeUpdates.set(usage.nodeName, current);
    }
  }

  if (nodeUpdates.size === 0) return workflow;

  return {
    ...workflow,
    nodes: workflow.nodes.map((n) => {
      const patch = nodeUpdates.get(n.name);
      if (!patch) return n;
      return {
        ...n,
        credentials: { ...(n.credentials ?? {}), ...patch },
      };
    }),
  };
}

/** Fetch local credential metadata from the API (metadata only). */
export async function fetchLocalCredentials(): Promise<CredentialMeta[]> {
  try {
    const res = await fetch("/api/v1/credentials");
    if (!res.ok) return [];
    return (await res.json()) as CredentialMeta[];
  } catch {
    return [];
  }
}
