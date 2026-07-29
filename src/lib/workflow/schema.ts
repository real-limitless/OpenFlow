import { z } from "zod";
import type { IWorkflow } from "./types";

/**
 * Permissive validation: we accept anything that has the structural minimum and
 * keep unknown keys so export can round-trip losslessly (`.passthrough()`).
 */

const positionSchema = z.tuple([z.number(), z.number()]);

const connectionTargetSchema = z
  .object({
    node: z.string(),
    type: z.string().default("main"),
    index: z.number().default(0),
  })
  .passthrough();

export const nodeSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    type: z.string(),
    typeVersion: z.number().default(1),
    position: positionSchema.default([0, 0]),
    parameters: z.record(z.unknown()).default({}),
    credentials: z.record(z.object({ id: z.string().nullish(), name: z.string() })).optional(),
    disabled: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const connectionsSchema = z.record(
  z.record(z.array(z.array(connectionTargetSchema).nullable())),
);

export const workflowSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().default("Imported workflow"),
    active: z.boolean().default(false),
    nodes: z.array(nodeSchema),
    connections: connectionsSchema.default({}),
    settings: z.record(z.unknown()).default({}),
    pinData: z.record(z.array(z.record(z.unknown()))).optional(),
    tags: z.array(z.union([z.string(), z.object({ name: z.string() }).passthrough()])).optional(),
  })
  .passthrough();

export type ParsedWorkflow = z.infer<typeof workflowSchema>;

export interface ParseResult {
  ok: boolean;
  workflow?: IWorkflow;
  error?: string;
}

let counter = 0;
export function newId(prefix = "n"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** Parse raw JSON text (or object) into our workflow model. */
export function parseWorkflowJson(input: string | unknown, fallbackId?: string): ParseResult {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
    }
  }

  const result = workflowSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      error: `Not a recognisable workflow: ${first.path.join(".") || "root"} — ${first.message}`,
    };
  }

  const parsed = result.data as Record<string, unknown> & ParsedWorkflow;

  const workflow: IWorkflow = {
    ...(parsed as unknown as IWorkflow),
    id: fallbackId ?? (parsed.id != null ? String(parsed.id) : newId("wf")),
    name: parsed.name,
    active: Boolean(parsed.active),
    nodes: parsed.nodes.map((n) => ({
      ...(n as Record<string, unknown>),
      id: (n.id as string) ?? newId("node"),
      name: n.name,
      type: n.type,
      typeVersion: n.typeVersion ?? 1,
      position: [n.position?.[0] ?? 0, n.position?.[1] ?? 0] as [number, number],
      parameters: (n.parameters ?? {}) as Record<string, unknown>,
    })) as IWorkflow["nodes"],
    connections: (parsed.connections ?? {}) as IWorkflow["connections"],
    settings: (parsed.settings ?? {}) as IWorkflow["settings"],
  };

  return { ok: true, workflow };
}

/** Serialise back to the public JSON shape, preserving unmodelled fields. */
export function serializeWorkflow(workflow: IWorkflow): string {
  const { ...rest } = workflow;
  const ordered = {
    name: rest.name,
    nodes: rest.nodes,
    connections: rest.connections,
    active: rest.active,
    settings: rest.settings,
    ...(rest.pinData && Object.keys(rest.pinData).length ? { pinData: rest.pinData } : {}),
    ...(rest.tags?.length ? { tags: rest.tags } : {}),
    ...Object.fromEntries(
      Object.entries(rest).filter(
        ([k]) =>
          !["name", "nodes", "connections", "active", "settings", "pinData", "tags"].includes(k),
      ),
    ),
  };
  return JSON.stringify(ordered, null, 2);
}
