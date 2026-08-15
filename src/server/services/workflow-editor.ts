import { prisma } from "../db";
import { parseWorkflowJson } from "../../lib/workflow/schema";
import type { IWorkflow } from "../../lib/workflow/types";
import * as mutations from "../../lib/workflow/mutations";
import { deserializeJsonFields, KNOWN_WORKFLOW_FIELDS, serializeJsonFields } from "./workflow-io";
import { emitWorkflowEvent, notifyExecutionStarted } from "./workflow-events";
import { allNodeTypes, getNodeType } from "../../lib/nodes/registry";
import { enqueueOrRun } from "../execute";
import { ensurePersonalProject } from "./projects";
import { ensureUser } from "./users";

export async function loadWorkflow(workflowId: string): Promise<IWorkflow | null> {
  const row = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!row) return null;
  return deserializeJsonFields(row as unknown as Record<string, unknown>);
}

export async function saveWorkflow(
  workflowId: string,
  wf: IWorkflow,
  userId = "local",
  source = "editor",
): Promise<IWorkflow> {
  const parsed = parseWorkflowJson({ ...wf, id: workflowId }, workflowId);
  if (!parsed.ok) throw new Error(parsed.error ?? "Invalid workflow");
  const next = parsed.workflow!;
  const existing = await prisma.workflow.findUnique({ where: { id: workflowId } });

  const data = serializeJsonFields({
    name: next.name,
    active: next.active,
    versionId: next.versionId ?? existing?.versionId ?? crypto.randomUUID(),
    nodes: next.nodes,
    connections: next.connections,
    settings: next.settings,
    staticData: next.staticData ?? null,
    pinData: next.pinData ?? null,
    meta: next.meta ?? null,
    ...Object.fromEntries(
      Object.entries(next as Record<string, unknown>).filter(
        ([k]) => !KNOWN_WORKFLOW_FIELDS.has(k),
      ),
    ),
  });

  await ensureUser(userId);
  const projectId = existing?.projectId ?? (await ensurePersonalProject(userId));

  const row = existing
    ? await prisma.workflow.update({
        where: { id: workflowId },
        data: {
          name: data.name as string,
          active: data.active as boolean,
          versionId: data.versionId as string,
          nodes: data.nodes as string,
          connections: data.connections as string,
          settings: (data.settings as string) ?? null,
          staticData: (data.staticData as string) ?? null,
          pinData: (data.pinData as string) ?? null,
          meta: (data.meta as string) ?? null,
          extra: (data.extra as string) ?? null,
        },
      })
    : await prisma.workflow.create({
        data: {
          id: workflowId,
          userId,
          projectId,
          name: data.name as string,
          active: data.active as boolean,
          versionId: data.versionId as string,
          nodes: data.nodes as string,
          connections: data.connections as string,
          settings: (data.settings as string) ?? null,
          staticData: (data.staticData as string) ?? null,
          pinData: (data.pinData as string) ?? null,
          meta: (data.meta as string) ?? null,
          extra: (data.extra as string) ?? null,
        },
      });

  const saved = deserializeJsonFields(row as unknown as Record<string, unknown>);
  // "editor" saves are local client flushes — don't bounce the graph back over SSE.
  if (source !== "editor") {
    emitWorkflowEvent({
      type: "workflow.updated",
      workflowId,
      workflow: saved,
      source,
    });
  }
  return saved;
}

/** Serialize load→mutate→save per workflow so concurrent MCP/editor tools don't clobber each other. */
const workflowMutationTails = new Map<string, Promise<unknown>>();

async function withWorkflowLock<T>(workflowId: string, fn: () => Promise<T>): Promise<T> {
  const prev = workflowMutationTails.get(workflowId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate, () => gate);
  workflowMutationTails.set(workflowId, tail);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (workflowMutationTails.get(workflowId) === tail) {
      workflowMutationTails.delete(workflowId);
    }
  }
}

async function withWorkflow<T>(
  workflowId: string,
  source: string,
  userId: string,
  fn: (wf: IWorkflow) => mutations.MutationResult<T> | Promise<mutations.MutationResult<T>>,
): Promise<{ workflow: IWorkflow; result: T }> {
  return withWorkflowLock(workflowId, async () => {
    const current = await loadWorkflow(workflowId);
    if (!current) throw new Error(`Workflow not found: ${workflowId}`);
    const { workflow, result } = await fn(current);
    const saved = await saveWorkflow(workflowId, { ...workflow, id: workflowId }, userId, source);
    return { workflow: saved, result };
  });
}

export async function editorGetWorkflow(workflowId: string) {
  const wf = await loadWorkflow(workflowId);
  if (!wf) throw new Error(`Workflow not found: ${workflowId}`);
  return mutations.summarizeWorkflow(wf);
}

export async function editorListNodeTypes(query?: string, limit = 40) {
  const q = (query ?? "").trim().toLowerCase();
  let types = allNodeTypes().filter((t) => !t.placeholder);
  if (q) {
    types = types.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.displayName.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q),
    );
  }
  const items = types.slice(0, Math.min(100, Math.max(1, limit))).map((t) => ({
    name: t.name,
    displayName: t.displayName,
    description: t.description,
    category: t.category,
    inputs: t.inputs,
    outputs: t.outputs,
    version: t.version,
  }));
  return { count: items.length, items };
}

export async function editorGetNodeType(type: string) {
  const t = getNodeType(type);
  return {
    name: t.name,
    displayName: t.displayName,
    description: t.description,
    category: t.category,
    inputs: t.inputs,
    outputs: t.outputs,
    version: t.version,
    defaults: t.defaults,
    credentials: t.credentials,
    properties: t.properties.map((p) => ({
      name: p.name,
      displayName: p.displayName,
      type: p.type,
      default: p.default,
      description: p.description,
      required: p.required,
      options: p.options,
      displayOptions: p.displayOptions,
      typeOptions: p.typeOptions,
    })),
    placeholder: t.placeholder ?? false,
  };
}

export async function editorAddNode(
  workflowId: string,
  args: { type: string; x?: number; y?: number; name?: string },
  userId = "local",
) {
  const count = (await loadWorkflow(workflowId))?.nodes.length ?? 0;
  const x = args.x ?? 120 + count * 40;
  const y = args.y ?? 120 + (count % 4) * 40;
  return withWorkflow(workflowId, "assistant", userId, (wf) =>
    mutations.addNode(wf, args.type, { x, y }, args.name),
  );
}

export async function editorUpdateNode(
  workflowId: string,
  args: {
    name: string;
    parameters?: Record<string, unknown>;
    mergeParameters?: boolean;
    credentials?: Record<string, { id?: string | null; name: string }> | null;
    notes?: string;
    disabled?: boolean;
    x?: number;
    y?: number;
  },
  userId = "local",
) {
  return withWorkflow(workflowId, "assistant", userId, (wf) => {
    let next = wf;
    let last: unknown = { name: args.name };
    if (args.parameters) {
      const r = mutations.updateParameters(
        next,
        args.name,
        args.parameters,
        args.mergeParameters !== false,
      );
      next = r.workflow;
      last = r.result;
    }
    if (args.credentials !== undefined) {
      const r = mutations.updateCredentials(next, args.name, args.credentials);
      next = r.workflow;
      last = r.result;
    }
    if (args.notes !== undefined) {
      const r = mutations.setNodeNotes(next, args.name, args.notes);
      next = r.workflow;
      last = r.result;
    }
    if (args.disabled !== undefined) {
      const r = mutations.setNodeDisabled(next, args.name, args.disabled);
      next = r.workflow;
      last = r.result;
    }
    if (args.x !== undefined && args.y !== undefined) {
      const r = mutations.moveNode(next, args.name, { x: args.x, y: args.y });
      next = r.workflow;
      last = r.result;
    }
    return { workflow: next, result: last };
  });
}

export async function editorRenameNode(
  workflowId: string,
  from: string,
  to: string,
  userId = "local",
) {
  return withWorkflow(workflowId, "assistant", userId, (wf) => mutations.renameNode(wf, from, to));
}

export async function editorDeleteNode(workflowId: string, name: string, userId = "local") {
  return withWorkflow(workflowId, "assistant", userId, (wf) => mutations.deleteNode(wf, name));
}

export async function editorConnect(
  workflowId: string,
  args: {
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  },
  userId = "local",
) {
  return withWorkflow(workflowId, "assistant", userId, (wf) =>
    mutations.connectNodes(wf, args.source, args.target, args.sourceHandle, args.targetHandle),
  );
}

export async function editorDisconnect(workflowId: string, edgeId: string, userId = "local") {
  return withWorkflow(workflowId, "assistant", userId, (wf) =>
    mutations.disconnectByEdgeId(wf, edgeId),
  );
}

export async function editorExecute(workflowId: string, userId = "local") {
  const row = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!row) throw new Error(`Workflow not found: ${workflowId}`);
  const wf = deserializeJsonFields(row as unknown as Record<string, unknown>);
  const ownerId = row.userId;
  const execution = await prisma.execution.create({
    data: {
      workflowId,
      status: "running",
      mode: "manual",
    },
  });
  await enqueueOrRun(workflowId, execution.id, "manual", wf.pinData, wf, ownerId, row.projectId);
  notifyExecutionStarted(workflowId, execution.id, "manual");
  return { executionId: execution.id };
}

export async function editorGetExecution(executionId: string) {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row) throw new Error(`Execution not found: ${executionId}`);
  let runData: unknown = {};
  let error: unknown = null;
  try {
    runData = JSON.parse(row.runData);
  } catch {
    runData = {};
  }
  if (row.error) {
    try {
      error = JSON.parse(row.error);
    } catch {
      error = row.error;
    }
  }
  return {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status,
    mode: row.mode,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    runData,
    error,
  };
}

export async function editorListCredentials(userId = "local") {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const projectIds = memberships.map((m) => m.projectId);
  const rows = await prisma.credential.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
  return { count: rows.length, items: rows };
}

export function editorSelectNode(workflowId: string, nodeName: string | null) {
  emitWorkflowEvent({ type: "node.selected", workflowId, nodeName });
  return { nodeName };
}
